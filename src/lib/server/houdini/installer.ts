import { execFile, spawn } from 'node:child_process';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { discoverHoudiniWorkspace, scanHoudiniWorkspace } from './discovery.js';
import { applyPackageConfigFixes } from '../../houdini/package-config-fixes.js';
import type {
	HoudiniInstall,
	InstallPluginRequest,
	InstallPluginResponse,
	PluginRecord,
	HoudiniPluginAction,
	HoudiniPluginActionResponse,
	HoudiniPluginMigrationRequest
} from '../../houdini/types.js';

const execFileAsync = promisify(execFile);
const commandTimeout = 120_000;

export async function installHoudiniPlugin(
	request: InstallPluginRequest,
	signal?: AbortSignal
): Promise<InstallPluginResponse> {
	validateInstallPluginRequest(request);
	throwIfAborted(signal);

	const current = await discoverHoudiniWorkspace();
	const plugin = current.plugins.find((candidate) => candidate.id === request.pluginId);
	if (!plugin) throw new Error(`Plugin ${request.pluginId} was not found in the discovery scan.`);
	if (!plugin.repositoryUrl) {
		throw new Error(`${plugin.name} does not have a discoverable Git repository.`);
	}
	if (
		!(plugin.availableVersions ?? []).includes(request.version) &&
		plugin.gitCommit !== request.version
	) {
		throw new Error(`${request.version} is not an available Git version for ${plugin.name}.`);
	}

	const installs = selectInstalls(current.installs, request);
	if (!installs.length) throw new Error('No Houdini install matched the requested scope.');

	const repositoryPath = path.normalize(request.destinationPath);
	await ensureGitCheckout(plugin.repositoryUrl, request.version, repositoryPath, signal);

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
		await writeManagedPackage(packagePath, plugin, request.version, repositoryPath, signal);
	}

	throwIfAborted(signal);
	const discovery = await discoverHoudiniWorkspace();
	const targetLabel =
		installs.length === current.installs.length
			? 'all detected Houdini installs'
			: installs.map((install) => install.label).join(', ');
	return {
		message: `${plugin.name} ${request.version} installed for ${targetLabel} at ${repositoryPath}.`,
		discovery
	};
}

export async function runHoudiniPluginAction(
	request: HoudiniPluginAction
): Promise<HoudiniPluginActionResponse> {
	if (request?.action === 'migrate-configs') {
		return migratePluginConfigs(request);
	}
	if (request?.action === 'open-path') {
		if (typeof request.installId !== 'string' || !request.installId.trim()) {
			throw new Error('An install id is required.');
		}
		if (typeof request.path !== 'string' || !request.path.trim()) {
			throw new Error('A path is required.');
		}

		const current = await scanHoudiniWorkspace({ stage: 'installs' });
		const install = current.installs.find((candidate) => candidate.id === request.installId);
		if (!install) throw new Error('The Houdini install was not found.');
		const allowedPaths = [
			install.hfs,
			install.hconfig,
			install.userPreferences,
			install.packageDirectory,
			...install.packageRoots.map((root) => root.path)
		];
		if (!allowedPaths.some((allowedPath) => samePath(allowedPath, request.path))) {
			throw new Error('That path is not associated with the selected Houdini install.');
		}

		await openPath(request.path);
		return { message: `Opened ${path.basename(request.path)}.` };
	}
	if (
		!request ||
		typeof request !== 'object' ||
		typeof request.pluginId !== 'string' ||
		!request.pluginId.trim()
	) {
		throw new Error('A plugin id is required.');
	}
	if (request.action === 'open-source') {
		if (typeof request.sourcePath !== 'string' || !request.sourcePath.trim()) {
			throw new Error('A source path is required.');
		}
	} else if (typeof request.installId !== 'string' || !request.installId.trim()) {
		throw new Error('An install id is required.');
	}

	const current = await scanHoudiniWorkspace({
		stage: 'plugins',
		pluginIds: [request.pluginId]
	});
	const plugin = current.plugins.find((candidate) => candidate.id === request.pluginId);
	if (!plugin) throw new Error(`Plugin ${request.pluginId} was not found in the discovery scan.`);

	if (request.action === 'open-source') {
		const source = plugin.sources?.find(
			(candidate) => samePath(candidate.path, request.sourcePath) && candidate.exists
		);
		if (!source) throw new Error(`${plugin.name} has no available source folder at that path.`);
		await openPath(source.path);
		return { message: `Opened ${plugin.name} source folder.` };
	}

	if (request.action === 'open-package-folder') {
		const install = current.installs.find((candidate) => candidate.id === request.installId);
		if (!install) throw new Error(`${plugin.name} was not found for this Houdini install.`);
		const packageRoot = documentsPackageRoot(install);
		if (!packageRoot) {
			throw new Error(`${plugin.name} has no Documents package folder for this Houdini install.`);
		}
		await openPath(packageRoot);
		return { message: `Opened ${install.label} package folder.` };
	}

	if (
		request.action !== 'open-config' &&
		request.action !== 'get-config' &&
		request.action !== 'update-config' &&
		request.action !== 'set-enabled'
	) {
		throw new Error('Unknown plugin action.');
	}

	const target = current.targets.find(
		(candidate) =>
			candidate.pluginId === request.pluginId && candidate.installId === request.installId
	);
	if (!target?.packagePath) {
		throw new Error(`${plugin.name} has no discovered package config for this Houdini install.`);
	}

	if (request.action === 'get-config') {
		return {
			message: `Loaded ${target.packageFile}.`,
			config: await readPackageValue(target.packagePath),
			packagePath: target.packagePath
		};
	}

	if (request.action === 'update-config') {
		if (
			request.writeHpath !== false &&
			request.keepPathAlias !== 'HOUDINI_PATH' &&
			request.replacePathAlias !== 'HOUDINI_PATH' &&
			!validHpath(request.hpath)
		) {
			throw new Error('A valid local plugin source path is required.');
		}
		if (request.keepPathAlias === 'HOUDINI_PATH') {
			if (target.pathAliasConflict?.hpathUsedAsVariable) {
				throw new Error('Replace $hpath references before removing hpath.');
			}
		} else if (
			!request.replacePathAlias &&
			!request.preservePathAliases &&
			target.pathAliasConflict?.houdiniPathUsedAsVariable
		) {
			if (target.pathAliasConflict?.houdiniPathUsedAsVariable) {
				throw new Error('Replace $HOUDINI_PATH references before removing HOUDINI_PATH.');
			}
		}
		const packageValue = applyPackageConfigFixes(
			await readPackageValue(target.packagePath),
			request
		);
		await writePackageValue(target.packagePath, packageValue);
		const discovery = await scanHoudiniWorkspace({
			stage: 'plugins',
			pluginIds: [request.pluginId]
		});
		return {
			message: `Updated ${target.packageFile}.`,
			discovery
		};
	}

	if (request.action === 'open-config') {
		await openPath(target.packagePath);
		return { message: `Opened ${target.packageFile}.` };
	}

	if (request.action === 'set-enabled') {
		await setPackageEnabled(target.packagePath, request.enabled);
		const discovery = await scanHoudiniWorkspace({
			stage: 'plugins',
			pluginIds: [request.pluginId]
		});
		return {
			message: `${plugin.name} ${request.enabled ? 'enabled' : 'disabled'} for the selected Houdini install.`,
			discovery
		};
	}

	throw new Error('Unknown plugin action.');
}

async function migratePluginConfigs(
	request: HoudiniPluginMigrationRequest
): Promise<HoudiniPluginActionResponse> {
	validatePluginMigrationRequest(request);
	const pluginIds = request.sources.map(({ pluginId }) => pluginId);
	const current = await scanHoudiniWorkspace({ stage: 'plugins', pluginIds });
	const destinationInstall = current.installs.find(
		(install) => install.id === request.destinationInstallId
	);
	if (!destinationInstall) throw new Error('The destination Houdini install was not found.');

	const selectedPlugins = request.sources.map(({ pluginId }) => {
		const plugin = current.plugins.find((candidate) => candidate.id === pluginId);
		if (!plugin) throw new Error(`Plugin ${pluginId} was not found in the discovery scan.`);
		return plugin;
	});

	let copiedPlugins = 0;
	for (const [index, plugin] of selectedPlugins.entries()) {
		const sourceInstallId = request.sources[index].sourceInstallId;
		const sourceTarget = current.targets.find(
			(target) => target.pluginId === plugin.id && target.installId === sourceInstallId
		);
		if (!sourceTarget?.packagePath) continue;

		const packageValue = await readPackageValue(sourceTarget.packagePath);
		const packageFile = safePackageFile(sourceTarget.packageFile || plugin.packageFile);
		const packageDirectory = await writableUserPackageDirectory(destinationInstall);
		await mkdir(packageDirectory, { recursive: true });
		await writePackageValue(path.join(packageDirectory, packageFile), packageValue);
		copiedPlugins += 1;
	}

	if (!copiedPlugins) {
		throw new Error('No selected plugins have a package config in the source Houdini install.');
	}

	const discovery = await scanHoudiniWorkspace({
		stage: 'plugins',
		pluginIds
	});
	return {
		message: `Copied ${copiedPlugins} plugin config${copiedPlugins === 1 ? '' : 's'} to ${destinationInstall.label}.`,
		discovery
	};
}

function validatePluginMigrationRequest(request: HoudiniPluginMigrationRequest): void {
	if (typeof request.destinationInstallId !== 'string' || !request.destinationInstallId.trim()) {
		throw new Error('A destination Houdini install id is required.');
	}
	if (!Array.isArray(request.sources) || !request.sources.length) {
		throw new Error('At least one plugin source is required.');
	}
	if (
		request.sources.some(
			(source) =>
				!source ||
				typeof source.pluginId !== 'string' ||
				!source.pluginId.trim() ||
				typeof source.sourceInstallId !== 'string' ||
				!source.sourceInstallId.trim()
		)
	) {
		throw new Error('Each plugin source requires a plugin id and install id.');
	}
	const pluginIds = request.sources.map(({ pluginId }) => pluginId);
	if (new Set(pluginIds).size !== pluginIds.length) {
		throw new Error('Plugin ids must be unique.');
	}
}

function safePackageFile(packageFile: string): string {
	if (!packageFile || packageFile === '.' || packageFile === '..' || /[\\/:\0]/.test(packageFile)) {
		throw new Error('A discovered plugin package filename is invalid.');
	}
	return packageFile;
}

function validHpath(value: string | undefined): value is string {
	return typeof value === 'string' && Boolean(value.trim()) && !/[\0\r\n]/.test(value);
}

function samePath(left: string, right: string): boolean {
	const normalizedLeft = path.normalize(left);
	const normalizedRight = path.normalize(right);
	return process.platform === 'win32'
		? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
		: normalizedLeft === normalizedRight;
}

function documentsPackageRoot(install: HoudiniInstall): string | null {
	const expectedVersionDirectory = `houdini${install.version}`.toLowerCase();
	return (
		install.packageRoots.find(({ path: root, origin }) => {
			const normalizedRoot = path.normalize(root);
			return (
				origin === 'user' &&
				path.basename(normalizedRoot).toLowerCase() === 'packages' &&
				path.basename(path.dirname(normalizedRoot)).toLowerCase() === expectedVersionDirectory &&
				path.basename(path.dirname(path.dirname(normalizedRoot))).toLowerCase() === 'documents'
			);
		})?.path ?? null
	);
}

export function validateInstallPluginRequest(request: InstallPluginRequest): void {
	if (!request || typeof request !== 'object') {
		throw new Error('Install request must be an object.');
	}
	if (typeof request.pluginId !== 'string' || !request.pluginId.trim()) {
		throw new Error('A plugin id is required.');
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

async function writableUserPackageDirectory(install: HoudiniInstall): Promise<string> {
	const userRoots = install.packageRoots
		.filter((root) => root.origin === 'user')
		.map((root) => root.path);
	const expectedVersionDirectory = `houdini${install.version}`.toLowerCase();
	const documentsRoot = userRoots.find((root) => {
		const normalizedRoot = path.normalize(root);
		return (
			path.basename(normalizedRoot).toLowerCase() === 'packages' &&
			path.basename(path.dirname(normalizedRoot)).toLowerCase() === expectedVersionDirectory &&
			path.basename(path.dirname(path.dirname(normalizedRoot))).toLowerCase() === 'documents'
		);
	});
	if (documentsRoot) return documentsRoot;

	for (const root of userRoots) {
		if (await isDirectory(root)) return root;
	}

	return userRoots[0] ?? install.packageDirectory;
}

async function ensureGitCheckout(
	repositoryUrl: string,
	version: string,
	destination: string,
	signal?: AbortSignal
): Promise<void> {
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
				['clone', '--no-checkout', repositoryUrl, destination],
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
}

async function writeManagedPackage(
	packagePath: string,
	plugin: PluginRecord,
	version: string,
	repositoryPath: string,
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
		version
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

async function setPackageEnabled(packagePath: string, enabled: boolean): Promise<void> {
	const packageValue = await readPackageValue(packagePath);

	packageValue.enable = enabled;
	await writePackageValue(packagePath, packageValue);
}

async function readPackageValue(packagePath: string): Promise<Record<string, unknown>> {
	try {
		const parsed = JSON.parse(await readFile(packagePath, 'utf8')) as unknown;
		if (!isRecord(parsed)) throw new Error('Package JSON root must be an object.');
		return parsed;
	} catch (error) {
		throw new Error(
			`Cannot read ${path.basename(packagePath)}: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error }
		);
	}
}

async function writePackageValue(
	packagePath: string,
	packageValue: Record<string, unknown>
): Promise<void> {
	await writeFile(packagePath, `${JSON.stringify(packageValue, null, 2)}\n`, 'utf8');
}

async function openPath(target: string): Promise<void> {
	let targetStats;
	try {
		targetStats = await stat(target);
	} catch (error) {
		throw new Error(
			`Cannot open ${target}: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error }
		);
	}

	const command =
		process.platform === 'win32' ? 'cmd.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
	const normalizedTarget = path.normalize(target);
	const args =
		process.platform === 'win32'
			? targetStats.isDirectory()
				? ['/d', '/c', 'start', '', '/b', 'explorer.exe', normalizedTarget]
				: ['/d', '/c', 'start', '', '/b', normalizedTarget]
			: [normalizedTarget];

	const child = spawn(command, args, { stdio: 'ignore', windowsHide: true });
	child.unref?.();
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
