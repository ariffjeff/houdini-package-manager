import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { discoverHoudiniWorkspace } from './discovery.js';
import { applyPackageConfigFixes } from '../../houdini/package-config-fixes.js';
import { getPluginCatalog } from '../../plugin-discovery/catalog.js';
import { runHconfig } from './hconfig.js';
import { runPluginAction, writableUserPackageDirectory } from './plugin-actions.js';
import { migratePluginConfigs } from './plugin-migrator.js';
import { parseGithubRepositoryUrl } from '../plugin-discovery/github.js';
import { resolvePluginRepository } from '../plugin-discovery/discovery.js';
import type {
	HoudiniInstall,
	InstallPluginRequest,
	InstallPluginResponse,
	PluginRecord,
	HoudiniPluginAction,
	HoudiniPluginActionResponse
} from '../../houdini/types.js';

const execFileAsync = promisify(execFile);
const commandTimeout = 120_000;

type InstalledProvenance = {
	commit: string;
	manifestBlobSha: string;
	verifiedCommit: boolean;
	verifiedManifest: boolean;
	verified: boolean;
	approvedCommit?: string;
	approvedManifestBlobSha?: string;
	hasCuratedProvenance: boolean;
};

type InstallablePlugin = Pick<PluginRecord, 'id' | 'name' | 'packageFile' | 'repositoryUrl'> & {
	availableVersions?: string[];
	gitCommit?: string | null;
	pinnedCommit?: string;
	manifestBlobSha?: string;
};

export { expandWindowsShortPaths } from './hconfig.js';

export async function installHoudiniPlugin(
	request: InstallPluginRequest,
	signal?: AbortSignal
): Promise<InstallPluginResponse> {
	validateInstallPluginRequest(request);
	throwIfAborted(signal);

	const current = await discoverHoudiniWorkspace();
	const plugin = await resolveInstallablePlugin(request, current.plugins);
	if (!plugin.repositoryUrl)
		throw new Error(`${plugin.name} does not have a discoverable Git repository.`);
	const requestedVersionIsAvailable = (plugin.availableVersions ?? []).includes(request.version);
	const versionIsAllowed = requestedVersionIsAvailable || plugin.gitCommit === request.version;
	if (!versionIsAllowed) {
		throw new Error(`${request.version} is not an available Git version for ${plugin.name}.`);
	}

	const installs = selectInstalls(current.installs, request);
	if (!installs.length) throw new Error('No Houdini install matched the requested scope.');
	const repositoryPath = path.normalize(request.destinationPath);
	const provenance = await ensureGitCheckout(
		plugin.repositoryUrl,
		request.version,
		repositoryPath,
		signal,
		plugin.pinnedCommit,
		plugin.manifestBlobSha,
		plugin.packageFile
	);

	for (const install of installs) {
		throwIfAborted(signal);
		const packageDirectory = await writableUserPackageDirectory(install);
		await mkdir(packageDirectory, { recursive: true });
		const existingTarget = current.targets.find(
			(target) =>
				target.pluginId === plugin.id &&
				target.installId === install.id &&
				target.packagePath &&
				path.normalize(path.dirname(target.packagePath)) === path.normalize(packageDirectory)
		);
		const packagePath =
			existingTarget?.packagePath ?? path.join(packageDirectory, plugin.packageFile);
		await writeManagedPackage(
			packagePath,
			plugin,
			request.version,
			repositoryPath,
			provenance,
			signal
		);
	}

	throwIfAborted(signal);
	const discovery = await discoverHoudiniWorkspace();
	const targetLabel =
		installs.length === current.installs.length
			? 'all detected Houdini installs'
			: installs.map((install) => install.label).join(', ');
	const provenanceMessage = provenance.hasCuratedProvenance
		? provenance.verified
			? ' Verified against curated provenance.'
			: ' Install completed; unverified against the curated pin.'
		: provenance.commit
			? ` Verified commit ${provenance.commit.slice(0, 7)}.`
			: '';
	return {
		message: `${plugin.name} ${request.version} installed for ${targetLabel} at ${repositoryPath}.${provenanceMessage}`,
		discovery
	};
}

export async function runHoudiniPluginAction(
	request: HoudiniPluginAction,
	signal?: AbortSignal
): Promise<HoudiniPluginActionResponse> {
	if (request?.action === 'migrate-configs') return migratePluginConfigs(request);
	if (request?.action === 'run-hconfig') return runHconfig(request, signal);
	return runPluginAction(
		request as Exclude<HoudiniPluginAction, { action: 'migrate-configs' | 'run-hconfig' }>
	);
}

export function validateInstallPluginRequest(request: InstallPluginRequest): void {
	if (!request || typeof request !== 'object') {
		throw new Error('Install request must be an object.');
	}
	if (
		(request.pluginId !== undefined &&
			(typeof request.pluginId !== 'string' || !request.pluginId.trim())) ||
		(request.repositoryUrl !== undefined &&
			(typeof request.repositoryUrl !== 'string' || !request.repositoryUrl.trim()))
	) {
		throw new Error('A valid plugin id or GitHub repository URL is required.');
	}
	if (Boolean(request.pluginId) === Boolean(request.repositoryUrl)) {
		throw new Error('Provide exactly one plugin id or GitHub repository URL.');
	}
	if (request.packageFile !== undefined && !isSafePackageFile(request.packageFile)) {
		throw new Error('A valid Houdini package filename is required.');
	}
	if (
		typeof request.version !== 'string' ||
		!request.version.trim() ||
		/[\0\r\n]/.test(request.version) ||
		request.version.startsWith('-')
	) {
		throw new Error('A valid plugin version tag is required.');
	}
	if (
		!Array.isArray(request.installIds) ||
		!request.installIds.length ||
		request.installIds.some((installId) => typeof installId !== 'string' || !installId.trim())
	) {
		throw new Error('At least one Houdini install id is required.');
	}
	if (new Set(request.installIds).size !== request.installIds.length) {
		throw new Error('Houdini install ids must be unique.');
	}
	if (
		typeof request.destinationPath !== 'string' ||
		!request.destinationPath.trim() ||
		/[\0\r\n]/.test(request.destinationPath) ||
		!path.isAbsolute(request.destinationPath)
	) {
		throw new Error('An absolute plugin destination path is required.');
	}
}

function isSafePackageFile(value: string): boolean {
	return (
		Boolean(value.trim()) &&
		value === path.basename(value) &&
		value.toLowerCase().endsWith('.json') &&
		!/[\0\r\n]/.test(value)
	);
}

async function resolveInstallablePlugin(
	request: InstallPluginRequest,
	plugins: PluginRecord[]
): Promise<InstallablePlugin> {
	if (request.pluginId) {
		const plugin = plugins.find((candidate) => candidate.id === request.pluginId);
		if (!plugin) throw new Error(`Plugin ${request.pluginId} was not found in the discovery scan.`);
		const catalogEntry = findCatalogEntry(plugin.repositoryUrl);
		const availableVersions = catalogEntry
			? [...new Set([...(plugin.availableVersions ?? []), catalogEntry.pinnedCommit])]
			: plugin.availableVersions;
		return {
			...plugin,
			availableVersions,
			pinnedCommit: catalogEntry?.pinnedCommit,
			manifestBlobSha: catalogEntry?.manifestBlobSha
		};
	}

	if (!request.repositoryUrl) {
		throw new Error('A discovered plugin id or GitHub repository URL is required.');
	}

	const candidate = await resolvePluginRepository(request.repositoryUrl, request.packageFile);
	return {
		id: candidate.id,
		name: candidate.name,
		packageFile: candidate.packageFile,
		repositoryUrl: candidate.repositoryUrl,
		availableVersions: candidate.versions.map((version) => version.value),
		pinnedCommit: candidate.pinnedCommit,
		manifestBlobSha: candidate.manifestBlobSha
	};
}

function findCatalogEntry(repositoryUrl: string | null | undefined) {
	if (!repositoryUrl) return undefined;
	try {
		const repository = parseGithubRepositoryUrl(repositoryUrl).url;
		return getPluginCatalog().find(
			(entry) => parseGithubRepositoryUrl(entry.repositoryUrl).url === repository
		);
	} catch {
		return undefined;
	}
}

function selectInstalls(
	installs: HoudiniInstall[],
	request: InstallPluginRequest
): HoudiniInstall[] {
	const selectedIds = new Set(request.installIds);
	const selectedInstalls = installs.filter((install) => selectedIds.has(install.id));
	if (selectedInstalls.length !== selectedIds.size) {
		throw new Error('One or more requested Houdini installs were not found.');
	}
	return selectedInstalls;
}

async function ensureGitCheckout(
	repositoryUrl: string,
	version: string,
	destination: string,
	signal?: AbortSignal,
	pinnedCommit?: string,
	manifestBlobSha?: string,
	packageFile?: string
): Promise<InstalledProvenance> {
	throwIfAborted(signal);
	const destinationExists = await isDirectory(destination);
	if (destinationExists) {
		if (await runGit(destination, ['rev-parse', '--is-inside-work-tree'])) {
			await runGitRequired(destination, ['fetch', '--tags', '--prune', 'origin'], signal);
		} else if (await hasEntries(destination)) {
			throw new Error(`Managed plugin directory is not a Git checkout: ${destination}`);
		} else {
			await rm(destination, { recursive: true, force: true });
		}
	}

	if (!destinationExists) {
		throwIfAborted(signal);
		await mkdir(path.dirname(destination), { recursive: true });
		try {
			await runGitRequired(
				undefined,
				['clone', '--no-checkout', '--no-recurse-submodules', repositoryUrl, destination],
				signal
			);
		} catch (error) {
			if (signal?.aborted) {
				await rm(destination, { recursive: true, force: true });
			}
			throw error;
		}
	}

	await runGitRequired(destination, ['checkout', '--detach', version], signal);
	const checkedOutCommit = await runGitRequired(destination, ['rev-parse', 'HEAD'], signal);
	if (!packageFile) throw new Error('The installed plugin package file is required.');
	const manifestCommitPath = `HEAD:${packageFile.replaceAll('\\', '/')}`;
	const checkedOutManifest = await runGitRequired(
		destination,
		['rev-parse', manifestCommitPath],
		signal
	);
	const verifiedCommit = Boolean(
		pinnedCommit && checkedOutCommit.toLowerCase() === pinnedCommit.toLowerCase()
	);
	const verifiedManifest = Boolean(
		manifestBlobSha && checkedOutManifest.toLowerCase() === manifestBlobSha.toLowerCase()
	);
	const hasCuratedProvenance = Boolean(pinnedCommit || manifestBlobSha);
	return {
		commit: checkedOutCommit,
		manifestBlobSha: checkedOutManifest,
		verifiedCommit,
		verifiedManifest,
		verified: hasCuratedProvenance && verifiedCommit && verifiedManifest,
		...(pinnedCommit ? { approvedCommit: pinnedCommit } : {}),
		...(manifestBlobSha ? { approvedManifestBlobSha: manifestBlobSha } : {}),
		hasCuratedProvenance
	};
}

async function writeManagedPackage(
	packagePath: string,
	plugin: Pick<PluginRecord, 'name' | 'packageFile' | 'repositoryUrl'>,
	version: string,
	repositoryPath: string,
	provenance: InstalledProvenance,
	signal?: AbortSignal
): Promise<void> {
	throwIfAborted(signal);
	let packageValue: Record<string, unknown> = {};
	try {
		const existing = JSON.parse(await readFile(packagePath, 'utf8')) as unknown;
		if (isRecord(existing)) packageValue = existing;
	} catch (error) {
		if (await fileExists(packagePath)) {
			throw new Error(
				`Cannot update ${plugin.packageFile}: ${error instanceof Error ? error.message : String(error)}`,
				{ cause: error }
			);
		}
	}

	const pathAlias = hasJsonKey(packageValue, 'HOUDINI_PATH') ? 'HOUDINI_PATH' : 'hpath';
	packageValue = applyPackageConfigFixes(packageValue, {
		hpath: repositoryPath,
		pathAlias,
		migrateLegacyPath: true
	});
	packageValue.hpm = {
		managed: true,
		repository: plugin.repositoryUrl,
		version,
		...(provenance.commit ? { commit: provenance.commit } : {}),
		...(provenance.manifestBlobSha ? { manifestBlobSha: provenance.manifestBlobSha } : {}),
		...(provenance.hasCuratedProvenance
			? {
					verified: provenance.verified,
					approvedCommit: provenance.approvedCommit,
					approvedManifestBlobSha: provenance.approvedManifestBlobSha
				}
			: {})
	};
	await writeFile(packagePath, `${JSON.stringify(packageValue, null, 2)}\n`, 'utf8');
}

function hasJsonKey(value: unknown, key: string): boolean {
	if (Array.isArray(value)) return value.some((entry) => hasJsonKey(entry, key));
	if (!isRecord(value)) return false;
	return (
		Object.prototype.hasOwnProperty.call(value, key) ||
		Object.values(value).some((entry) => hasJsonKey(entry, key))
	);
}

async function runGit(cwd: string | undefined, args: string[]): Promise<string> {
	try {
		const result = await execFileAsync('git', args, {
			cwd,
			encoding: 'utf8',
			maxBuffer: 1024 * 1024,
			timeout: commandTimeout,
			windowsHide: true
		});
		return result.stdout.trim();
	} catch {
		return '';
	}
}

async function runGitRequired(
	cwd: string | undefined,
	args: string[],
	signal?: AbortSignal
): Promise<string> {
	try {
		const result = await execFileAsync('git', args, {
			cwd,
			encoding: 'utf8',
			maxBuffer: 1024 * 1024,
			timeout: commandTimeout,
			windowsHide: true,
			signal
		});
		return result.stdout.trim();
	} catch (error) {
		const commandError = error as Error & { stderr?: string };
		throw new Error(commandError.stderr?.trim() || commandError.message, { cause: error });
	}
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) {
		throw new DOMException('Plugin installation was cancelled.', 'AbortError');
	}
}

async function hasEntries(directory: string): Promise<boolean> {
	try {
		return (await readdir(directory)).length > 0;
	} catch {
		return false;
	}
}

async function isDirectory(filePath: string): Promise<boolean> {
	try {
		return (await stat(filePath)).isDirectory();
	} catch {
		return false;
	}
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		return (await stat(filePath)).isFile();
	} catch {
		return false;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
