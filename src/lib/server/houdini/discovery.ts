import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type {
	HoudiniDiscoveryDiagnostic,
	HoudiniDiscoveryResponse,
	HoudiniDiscoveryStage,
	HoudiniInstall,
	HoudiniPlatform,
	HoudiniScanRequest,
	HoudiniScanStage,
	InstallHealth,
	PackageOrigin,
	PluginRecord,
	PluginSource,
	PluginVersionSource
} from '../../houdini/types.js';

const execFileAsync = promisify(execFile);
const isWindows = process.platform === 'win32';
const pathDelimiter = isWindows ? ';' : ':';
const hconfigName = isWindows ? 'hconfig.exe' : 'hconfig';

type PackageConfig = {
	plugin: PluginRecord;
	enabled: boolean;
	valid: boolean;
	packagePath: string;
	origin: PackageOrigin;
	paths: string[];
	existingPaths: string[];
	missingPaths: string[];
	stalePaths: string[];
	sources: PluginSource[];
	error?: string;
};

type ScannedInstall = {
	install: HoudiniInstall;
	packages: Map<string, PackageConfig>;
};

type ScanInstallOptions = {
	skipPackages?: boolean;
};

type PackageScanOptions = {
	pluginIds?: Set<string>;
	syncRemoteGit?: boolean;
};

type DiscoveryCache = {
	scannedInstalls: ScannedInstall[];
	diagnostics: HoudiniDiscoveryDiagnostic[];
	scannedAt: string;
	stageScannedAt: Record<HoudiniDiscoveryStage, string | null>;
	gitSyncedAt: string | null;
	gitSyncedPluginIds: string[];
	gitSyncedAtByPluginId: Record<string, string>;
	persistedAt: string | null;
};

type PersistedDiscoverySnapshot = {
	version: 1;
	savedAt: string;
	cache: {
		scannedInstalls: Array<{
			install: HoudiniInstall;
			packages: Array<[string, PackageConfig]>;
		}>;
		diagnostics: HoudiniDiscoveryDiagnostic[];
		scannedAt: string;
		stageScannedAt: Record<HoudiniDiscoveryStage, string | null>;
		gitSyncedAt: string | null;
		gitSyncedPluginIds: string[];
		gitSyncedAtByPluginId: Record<string, string>;
	};
};

type InstallIdentity = {
	version: string;
	build: string;
};

let discoveryCache: DiscoveryCache | null = null;
const validScanStages = new Set<HoudiniScanStage>(['all', 'installs', 'plugins', 'git']);

export type GitMetadata = {
	ref: string;
	tag: string | null;
	branch: string | null;
	commit: string;
	author: string | null;
	repositoryUrl: string | null;
	license: string | null;
	availableVersions: string[];
};

export function parseHconfigOutput(output: string): Record<string, string> {
	const variables: Record<string, string> = {};

	for (const line of output.split(/\r?\n/)) {
		const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:=\s*(.*?)\s*$/);
		if (!match) continue;

		let value = match[2].trim();
		if (
			(value.startsWith("'") && value.endsWith("'")) ||
			(value.startsWith('"') && value.endsWith('"'))
		) {
			value = value.slice(1, -1);
		}

		if (value === '<not defined>') continue;
		variables[match[1]] = value.replaceAll('\\\\', '\\');
	}

	return variables;
}

export function parseInstallIdentity(root: string): InstallIdentity {
	const match = path.basename(root).match(/(?:houdini|hfs)[\s._-]*(\d+\.\d+)(?:[\s._-]?(\d+))?/i);

	return {
		version: match?.[1] ?? 'Unknown',
		build: match?.[2] ?? 'Unknown'
	};
}

export async function discoverHoudiniWorkspace(): Promise<HoudiniDiscoveryResponse> {
	return scanHoudiniWorkspace({ stage: 'all' });
}

export async function loadHoudiniDiscoverySnapshot(): Promise<HoudiniDiscoveryResponse | null> {
	if (!discoveryCache?.persistedAt) {
		discoveryCache = await readPersistedDiscoveryCache();
	}

	if (!discoveryCache?.persistedAt) return null;

	return buildDiscoveryResponse(discoveryCache, 'saved');
}

export async function scanHoudiniWorkspace(
	request: HoudiniScanRequest
): Promise<HoudiniDiscoveryResponse> {
	validateScanRequest(request);

	if (request.stage === 'all') {
		const discovered = await discoverInstallScans();
		const withPlugins = await discoverPluginsForInstalls(
			discovered.scannedInstalls,
			undefined,
			false
		);
		const pluginsScannedAt = new Date().toISOString();
		const withGit = await discoverPluginsForInstalls(withPlugins, undefined, true);
		const gitSyncedAt = new Date().toISOString();
		const gitSyncedPluginIds = collectGitPluginIds(withGit);
		return cacheAndBuild(
			withGit,
			discovered.scannedAt,
			discovered.diagnostics,
			gitSyncedAt,
			gitSyncedPluginIds,
			updateGitSyncTimes(discovered.gitSyncedAtByPluginId, gitSyncedPluginIds, gitSyncedAt),
			{
				installs: discovered.scannedAt,
				plugins: pluginsScannedAt,
				git: gitSyncedAt
			}
		);
	}

	if (request.stage === 'installs') {
		const discovered = await discoverInstallScans();
		const previousInstalls = new Map(
			(discoveryCache?.scannedInstalls ?? []).map((scanned) => [scanned.install.id, scanned])
		);
		const scannedInstalls = discovered.scannedInstalls.map((scanned) => {
			const previous = previousInstalls.get(scanned.install.id);
			if (!previous) return scanned;

			return {
				install: updateInstallPackageData(scanned.install, previous.packages),
				packages: previous.packages
			};
		});
		return cacheAndBuild(
			scannedInstalls,
			discovered.scannedAt,
			discovered.diagnostics,
			discovered.gitSyncedAt,
			discovered.gitSyncedPluginIds,
			discovered.gitSyncedAtByPluginId,
			{
				...discovered.stageScannedAt,
				installs: discovered.scannedAt
			}
		);
	}

	const base = await ensureDiscoveryCache();
	const pluginIds = normalizePluginIds(request.pluginIds);
	const scannedInstalls = await discoverPluginsForInstalls(
		base.scannedInstalls,
		pluginIds,
		request.stage === 'git'
	);
	const stageScannedAt = new Date().toISOString();
	const gitSyncedPluginIds =
		request.stage === 'git'
			? collectGitPluginIds(scannedInstalls, pluginIds)
			: base.gitSyncedPluginIds;
	const gitSyncedAt =
		request.stage === 'git' && gitSyncedPluginIds.length
			? new Date().toISOString()
			: base.gitSyncedAt;
	return cacheAndBuild(
		scannedInstalls,
		base.scannedAt,
		base.diagnostics,
		gitSyncedAt,
		gitSyncedPluginIds,
		request.stage === 'git'
			? updateGitSyncTimes(
					base.gitSyncedAtByPluginId,
					gitSyncedPluginIds,
					gitSyncedAt ?? new Date().toISOString()
				)
			: base.gitSyncedAtByPluginId,
		{
			...base.stageScannedAt,
			[request.stage]: stageScannedAt
		}
	);
}

function validateScanRequest(request: HoudiniScanRequest): void {
	if (!request || typeof request !== 'object' || !validScanStages.has(request.stage)) {
		throw new Error('Invalid Houdini scan stage. Expected all, installs, plugins, or git.');
	}

	if (
		request.pluginIds !== undefined &&
		(!Array.isArray(request.pluginIds) ||
			request.pluginIds.some((pluginId) => typeof pluginId !== 'string'))
	) {
		throw new Error('Houdini scan pluginIds must be an array of strings.');
	}
}

async function discoverInstallScans(): Promise<DiscoveryCache> {
	const scannedAt = new Date().toISOString();
	const roots = await findHoudiniRoots();
	const diagnostics: HoudiniDiscoveryDiagnostic[] = [];

	if (!roots.length) {
		diagnostics.push({
			severity: 'warning',
			message: 'No Houdini installation with a usable hconfig executable was found.'
		});
	}

	const scannedInstalls = await Promise.all(
		roots.map(async (root) => {
			try {
				return await scanInstall(root, scannedAt, new Map(), { skipPackages: true });
			} catch (error) {
				const identity = parseInstallIdentity(root);
				const installId = makeInstallId(root, identity);
				const message = error instanceof Error ? error.message : String(error);

				diagnostics.push({ severity: 'error', installId, message });
				return {
					install: makeFailedInstall(root, identity, installId, message, scannedAt),
					packages: new Map<string, PackageConfig>()
				};
			}
		})
	);

	return {
		scannedInstalls,
		scannedAt,
		diagnostics,
		stageScannedAt: {
			...emptyStageScannedAt(),
			...(discoveryCache?.stageScannedAt ?? {})
		},
		gitSyncedAt: discoveryCache?.gitSyncedAt ?? null,
		gitSyncedPluginIds: discoveryCache?.gitSyncedPluginIds ?? [],
		gitSyncedAtByPluginId: discoveryCache?.gitSyncedAtByPluginId ?? {},
		persistedAt: discoveryCache?.persistedAt ?? null
	};
}

async function ensureDiscoveryCache(): Promise<DiscoveryCache> {
	if (discoveryCache) return discoveryCache;

	const persisted = await readPersistedDiscoveryCache();
	if (persisted) {
		discoveryCache = persisted;
		return persisted;
	}

	const discovered = await discoverInstallScans();
	discoveryCache = discovered;
	return discovered;
}

async function discoverPluginsForInstalls(
	scannedInstalls: ScannedInstall[],
	pluginIds: Set<string> | undefined,
	syncRemoteGit: boolean
): Promise<ScannedInstall[]> {
	const gitCache = new Map<string, Promise<GitMetadata | null>>();

	return Promise.all(
		scannedInstalls.map(async (scanned) => {
			const discoveredPackages = await readPackageConfigs(
				scanned.install.packageRoots.map(({ path: directory, origin }) => ({ directory, origin })),
				scanned.install.version,
				scanned.install.variables,
				gitCache,
				{ pluginIds, syncRemoteGit }
			);
			const packages = pluginIds
				? replaceSelectedPackages(scanned.packages, discoveredPackages, pluginIds)
				: discoveredPackages;

			return {
				install: updateInstallPackageData(scanned.install, packages),
				packages
			};
		})
	);
}

function replaceSelectedPackages(
	existing: Map<string, PackageConfig>,
	discovered: Map<string, PackageConfig>,
	pluginIds: Set<string>
): Map<string, PackageConfig> {
	const packages = new Map(existing);
	for (const pluginId of pluginIds) packages.delete(pluginId);
	for (const [pluginId, packageConfig] of discovered) packages.set(pluginId, packageConfig);
	return packages;
}

function updateInstallPackageData(
	install: HoudiniInstall,
	packages: Map<string, PackageConfig>
): HoudiniInstall {
	const hasInvalidPackage = [...packages.values()].some((packageConfig) => !packageConfig.valid);
	const hasMissingPackagePath = [...packages.values()].some(
		(packageConfig) =>
			packageConfig.missingPaths.length ||
			(!packageConfig.existingPaths.length && packageConfig.stalePaths.length)
	);
	const diagnostics = install.diagnostics.filter(
		(diagnostic) =>
			diagnostic !== 'One or more package JSON files could not be parsed.' &&
			diagnostic !== 'One or more package JSON files point to missing plugin paths.'
	);
	if (hasInvalidPackage) diagnostics.push('One or more package JSON files could not be parsed.');
	if (hasMissingPackagePath) {
		diagnostics.push('One or more package JSON files point to missing plugin paths.');
	}

	return {
		...install,
		packageCount: packages.size,
		packageFiles: [...packages.values()].map((packageConfig) => packageConfig.plugin.packageFile),
		health:
			install.health === 'error' || hasInvalidPackage || hasMissingPackagePath
				? install.health === 'error'
					? 'error'
					: 'warning'
				: 'ready',
		diagnostics
	};
}

async function cacheAndBuild(
	scannedInstalls: ScannedInstall[],
	scannedAt: string,
	diagnostics: HoudiniDiscoveryDiagnostic[],
	gitSyncedAt: string | null,
	gitSyncedPluginIds: string[],
	gitSyncedAtByPluginId: Record<string, string>,
	stageScannedAt: Record<HoudiniDiscoveryStage, string | null>
): Promise<HoudiniDiscoveryResponse> {
	const nextCache: DiscoveryCache = {
		scannedInstalls,
		scannedAt,
		diagnostics,
		stageScannedAt,
		gitSyncedAt,
		gitSyncedPluginIds,
		gitSyncedAtByPluginId,
		persistedAt: null
	};
	discoveryCache = nextCache;
	const persistedAt = await persistDiscoveryCache(nextCache);
	discoveryCache = { ...nextCache, persistedAt };
	return buildDiscoveryResponse(discoveryCache, 'live');
}

function emptyStageScannedAt(): Record<HoudiniDiscoveryStage, string | null> {
	return { installs: null, plugins: null, git: null };
}

async function persistDiscoveryCache(cache: DiscoveryCache): Promise<string> {
	const savedAt = new Date().toISOString();
	const snapshot: PersistedDiscoverySnapshot = {
		version: 1,
		savedAt,
		cache: {
			scannedInstalls: cache.scannedInstalls.map(({ install, packages }) => ({
				install,
				packages: [...packages.entries()]
			})),
			diagnostics: cache.diagnostics,
			scannedAt: cache.scannedAt,
			stageScannedAt: cache.stageScannedAt,
			gitSyncedAt: cache.gitSyncedAt,
			gitSyncedPluginIds: cache.gitSyncedPluginIds,
			gitSyncedAtByPluginId: cache.gitSyncedAtByPluginId
		}
	};
	const snapshotPath = discoverySnapshotPath();
	const temporaryPath = `${snapshotPath}.${process.pid}.${randomUUID()}.tmp`;

	await mkdir(path.dirname(snapshotPath), { recursive: true });
	try {
		await writeFile(temporaryPath, `${JSON.stringify(snapshot)}\n`, 'utf8');
		await rename(temporaryPath, snapshotPath);
	} catch (error) {
		await rm(temporaryPath, { force: true }).catch(() => undefined);
		throw new Error(
			`Could not persist Houdini discovery snapshot: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error }
		);
	}

	return savedAt;
}

async function readPersistedDiscoveryCache(): Promise<DiscoveryCache | null> {
	let value: unknown;
	try {
		value = JSON.parse(await readFile(discoverySnapshotPath(), 'utf8')) as unknown;
	} catch {
		return null;
	}

	return deserializeDiscoveryCache(value);
}

function deserializeDiscoveryCache(value: unknown): DiscoveryCache | null {
	if (!isRecord(value) || value.version !== 1 || typeof value.savedAt !== 'string') return null;
	if (!isRecord(value.cache) || !Array.isArray(value.cache.scannedInstalls)) return null;
	if (
		typeof value.cache.scannedAt !== 'string' ||
		!Array.isArray(value.cache.diagnostics) ||
		!Array.isArray(value.cache.gitSyncedPluginIds) ||
		!isRecord(value.cache.gitSyncedAtByPluginId)
	) {
		return null;
	}

	const scannedInstalls: ScannedInstall[] = [];
	for (const scanned of value.cache.scannedInstalls) {
		if (!isRecord(scanned) || !isRecord(scanned.install) || !Array.isArray(scanned.packages)) {
			return null;
		}

		const packages = new Map<string, PackageConfig>();
		for (const entry of scanned.packages) {
			if (
				!Array.isArray(entry) ||
				entry.length !== 2 ||
				typeof entry[0] !== 'string' ||
				!isRecord(entry[1])
			) {
				return null;
			}
			packages.set(entry[0], entry[1] as unknown as PackageConfig);
		}

		scannedInstalls.push({
			install: scanned.install as unknown as HoudiniInstall,
			packages
		});
	}

	return {
		scannedInstalls,
		diagnostics: value.cache.diagnostics as HoudiniDiscoveryDiagnostic[],
		scannedAt: value.cache.scannedAt,
		stageScannedAt: readStageScannedAt(value.cache.stageScannedAt, value.cache.scannedAt),
		gitSyncedAt: typeof value.cache.gitSyncedAt === 'string' ? value.cache.gitSyncedAt : null,
		gitSyncedPluginIds: value.cache.gitSyncedPluginIds.filter(
			(pluginId): pluginId is string => typeof pluginId === 'string'
		),
		gitSyncedAtByPluginId: Object.fromEntries(
			Object.entries(value.cache.gitSyncedAtByPluginId).filter(
				(entry): entry is [string, string] => typeof entry[1] === 'string'
			)
		),
		persistedAt: value.savedAt
	};
}

function readStageScannedAt(
	value: unknown,
	legacyScannedAt: string
): Record<HoudiniDiscoveryStage, string | null> {
	if (!isRecord(value)) {
		return { installs: legacyScannedAt, plugins: null, git: null };
	}

	return {
		installs: typeof value.installs === 'string' ? value.installs : legacyScannedAt,
		plugins: typeof value.plugins === 'string' ? value.plugins : null,
		git: typeof value.git === 'string' ? value.git : null
	};
}

function discoverySnapshotPath(): string {
	const configuredPath = process.env.HPM_DISCOVERY_SNAPSHOT_PATH?.trim();
	if (configuredPath) return path.resolve(configuredPath);

	const dataDirectory = isWindows
		? (process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'))
		: process.platform === 'darwin'
			? path.join(os.homedir(), 'Library', 'Application Support')
			: (process.env.XDG_STATE_HOME ?? path.join(os.homedir(), '.local', 'state'));
	return path.join(dataDirectory, 'HoudiniPackageManager', 'discovery-snapshot.json');
}

function updateGitSyncTimes(
	existing: Record<string, string>,
	pluginIds: string[],
	syncedAt: string
): Record<string, string> {
	const updated = { ...existing };
	for (const pluginId of pluginIds) updated[pluginId] = syncedAt;
	return updated;
}

function collectGitPluginIds(
	scannedInstalls: ScannedInstall[],
	requestedPluginIds?: Set<string>
): string[] {
	const pluginIds = new Set<string>();

	for (const scanned of scannedInstalls) {
		for (const packageConfig of scanned.packages.values()) {
			if (
				packageConfig.plugin.repositoryUrl &&
				(!requestedPluginIds || requestedPluginIds.has(packageConfig.plugin.id))
			) {
				pluginIds.add(packageConfig.plugin.id);
			}
		}
	}

	return [...pluginIds].sort();
}

function normalizePluginIds(pluginIds: string[] | undefined): Set<string> | undefined {
	if (!pluginIds?.length) return undefined;
	return new Set(pluginIds.filter((pluginId) => typeof pluginId === 'string' && pluginId.trim()));
}

function buildDiscoveryResponse(
	cache: DiscoveryCache,
	source: 'live' | 'saved'
): HoudiniDiscoveryResponse {
	const {
		scannedInstalls,
		scannedAt,
		gitSyncedAt,
		gitSyncedPluginIds,
		gitSyncedAtByPluginId,
		diagnostics
	} = cache;
	const pluginsById = new Map<string, PluginRecord>();
	for (const scanned of scannedInstalls) {
		for (const packageConfig of scanned.packages.values()) {
			const existing = pluginsById.get(packageConfig.plugin.id);
			pluginsById.set(
				packageConfig.plugin.id,
				existing ? mergePluginRecords(existing, packageConfig.plugin) : packageConfig.plugin
			);
		}
	}

	const installs = scannedInstalls.map(({ install }) => install).sort(compareInstalls);
	const plugins = [...pluginsById.values()]
		.map((plugin) => ({
			...plugin,
			gitSyncedAt: plugin.repositoryUrl ? (gitSyncedAtByPluginId[plugin.id] ?? null) : null
		}))
		.sort((left, right) => left.name.localeCompare(right.name));
	const packagesByInstall = new Map(
		scannedInstalls.map(({ install, packages }) => [install.id, packages])
	);

	const targets = plugins.flatMap((plugin) =>
		installs.map((install) => {
			const packageConfig = packagesByInstall.get(install.id)?.get(plugin.id);
			const status = resolvePackageTargetStatus(packageConfig);

			return {
				pluginId: plugin.id,
				installId: install.id,
				status,
				artifactVersion:
					!packageConfig ||
					(packageConfig.missingPaths.length && !packageConfig.existingPaths.length) ||
					packageConfig.plugin.version === 'Unversioned'
						? null
						: packageConfig.plugin.version,
				packageFile: packageConfig?.plugin.packageFile ?? plugin.packageFile,
				packagePath: packageConfig?.packagePath ?? null,
				sourcePaths: packageConfig?.paths ?? [],
				origin: packageConfig?.origin ?? null,
				note: packageConfig
					? (packageConfig.error ??
						(packageConfig.missingPaths.length
							? `Package config has missing path${packageConfig.missingPaths.length === 1 ? '' : 's'}: ${packageConfig.missingPaths.join(', ')}${packageConfig.existingPaths.length ? `; available source${packageConfig.existingPaths.length === 1 ? '' : 's'}: ${packageConfig.existingPaths.join(', ')}` : ''}`
							: packageConfig.stalePaths.length
								? `Package config references removed HPM source${packageConfig.stalePaths.length === 1 ? '' : 's'}: ${packageConfig.stalePaths.join(', ')}${packageConfig.existingPaths.length ? `; available source${packageConfig.existingPaths.length === 1 ? '' : 's'}: ${packageConfig.existingPaths.join(', ')}` : ''}`
								: packageConfig.enabled
									? 'Package config was discovered and is enabled by default.'
									: 'Package config was discovered with enable=false.'))
					: 'No package config with this name was found for this Houdini install.'
			};
		})
	);

	return {
		installs,
		plugins,
		targets,
		scannedAt,
		stageScannedAt: cache.stageScannedAt,
		gitSyncedAt,
		gitSyncedPluginIds,
		persistedAt: cache.persistedAt,
		source,
		diagnostics
	};
}

async function findHoudiniRoots(): Promise<string[]> {
	const roots = new Map<string, string>();
	const addRoot = async (candidate: string) => {
		const hconfig = path.join(candidate, 'bin', hconfigName);
		if (!(await fileExists(hconfig))) return;

		const normalized = path.normalize(candidate);
		roots.set(normalized.toLowerCase(), normalized);
	};

	for (const value of [process.env.HFS, process.env.HFS_ROOT]) {
		if (value) await addRoot(value);
	}

	for (const directory of (process.env.PATH ?? '').split(pathDelimiter)) {
		if (!directory) continue;
		const hconfig = path.join(directory, hconfigName);
		if (await fileExists(hconfig)) await addRoot(path.dirname(path.dirname(hconfig)));
	}

	const parents = isWindows
		? [
				process.env.ProgramFiles,
				process.env['ProgramFiles(x86)'],
				'C:\\Program Files',
				'C:\\Program Files (x86)'
			]
				.filter((value): value is string => Boolean(value))
				.map((value) => path.join(value, 'Side Effects Software'))
		: ['/opt', '/usr/local', path.join(os.homedir(), 'houdini')];

	for (const parent of parents) {
		for (const entry of await directoryEntries(parent)) {
			if (!entry.isDirectory()) continue;
			if (!/(?:houdini|hfs)[\s._-]*\d+\.\d+/i.test(entry.name)) continue;
			await addRoot(path.join(parent, entry.name));
		}
	}

	return [...roots.values()];
}

async function scanInstall(
	root: string,
	scannedAt: string,
	gitCache: Map<string, Promise<GitMetadata | null>>,
	options: ScanInstallOptions = {}
): Promise<ScannedInstall> {
	const identity = parseInstallIdentity(root);
	const installId = makeInstallId(root, identity);
	const hconfig = path.join(root, 'bin', hconfigName);
	const diagnostics: string[] = [];
	let variables: Record<string, string>;
	let health: InstallHealth = 'ready';

	try {
		const result = await execFileAsync(hconfig, [], {
			cwd: root,
			env: { ...process.env, HFS: root },
			encoding: 'utf8',
			maxBuffer: 1024 * 1024,
			timeout: 10000,
			windowsHide: true
		});
		variables = parseHconfigOutput(result.stdout);
		if (result.stderr.trim()) diagnostics.push(result.stderr.trim());
	} catch (error) {
		const commandError = error as Error & { stderr?: string; stdout?: string };
		variables = parseHconfigOutput(commandError.stdout ?? '');
		diagnostics.push(commandError.stderr?.trim() || commandError.message);
		health = 'error';
	}

	const userPreferences =
		variables.HOUDINI_USER_PREF_DIR ?? path.join(os.homedir(), `houdini${identity.version}`);
	const packageDirectories = packageRoots(root, userPreferences, identity.version, variables);
	const packages = options.skipPackages
		? new Map<string, PackageConfig>()
		: await readPackageConfigs(packageDirectories, identity.version, variables, gitCache);
	if (packages.size && [...packages.values()].some((packageConfig) => !packageConfig.valid)) {
		health = health === 'error' ? health : 'warning';
		diagnostics.push('One or more package JSON files could not be parsed.');
	}
	if (
		packages.size &&
		[...packages.values()].some((packageConfig) => packageConfig.missingPaths.length)
	) {
		health = health === 'error' ? health : 'warning';
		diagnostics.push('One or more package JSON files point to missing plugin paths.');
	}

	const install: HoudiniInstall = {
		id: installId,
		label: `Houdini ${identity.version}`,
		version: identity.version,
		build: identity.build,
		platform: platformFromValue(variables.HOUDINI_OS),
		architecture: process.arch === 'x64' ? 'x86_64' : process.arch,
		role: 'Detected by hconfig',
		hfs: root,
		hconfig,
		userPreferences,
		packageDirectory: path.join(userPreferences, 'packages'),
		packageRoots: packageDirectories.map(({ directory, origin }) => ({ path: directory, origin })),
		packageCount: packages.size,
		packageFiles: [...packages.values()].map((packageConfig) => packageConfig.plugin.packageFile),
		houdiniPath: splitHoudiniPath(variables.HOUDINI_PATH, variables),
		variables,
		health,
		diagnostics,
		scannedAt
	};

	return { install, packages };
}

async function readPackageConfigs(
	packageDirectories: Array<{ directory: string; origin: PackageOrigin }>,
	version: string,
	variables: Record<string, string>,
	gitCache: Map<string, Promise<GitMetadata | null>>,
	options: PackageScanOptions = {}
): Promise<Map<string, PackageConfig>> {
	const packages = new Map<string, PackageConfig>();

	for (const { directory, origin } of packageDirectories) {
		for (const entry of await directoryEntries(directory)) {
			if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
			if (origin === 'site' && !sitePackageApplies(entry.name, version)) continue;

			const packagePath = path.join(directory, entry.name);
			const pluginId = packageId(entry.name);
			if (options.pluginIds && !options.pluginIds.has(pluginId)) continue;
			let parsed: Record<string, unknown> | undefined;
			let error: string | undefined;

			try {
				const value: unknown = JSON.parse(await readFile(packagePath, 'utf8'));
				if (!isRecord(value)) throw new Error('Package JSON root must be an object.');
				parsed = value;
			} catch (caught) {
				error = `Invalid package JSON: ${caught instanceof Error ? caught.message : String(caught)}`;
			}

			const declaredVersion = parsed ? declaredPackageVersion(parsed.version) : null;
			const inspectedSources = await inspectGitSources(
				parsed ? resolvePackagePaths(parsed, variables, directory) : [],
				gitCache,
				options.syncRemoteGit ?? true
			);
			const sourceRecords = inspectedSources.map(({ source }) =>
				declaredVersion && source.exists && !source.version
					? { ...source, version: declaredVersion, versionSource: 'package' as const }
					: source
			);
			const stalePaths = inspectedSources
				.filter(({ source }) => !source.exists && isManagedHpmPath(source.path, parsed))
				.map(({ source }) => source.path);
			const visibleSources = sourceRecords.filter((source) => !stalePaths.includes(source.path));
			const git = inspectedSources.find(({ metadata }) => metadata)?.metadata ?? null;
			const paths = visibleSources.map((source) => source.path);
			const existingPaths = visibleSources
				.filter((source) => source.exists)
				.map((source) => source.path);
			const missingPaths = visibleSources
				.filter((source) => !source.exists)
				.map((source) => source.path);
			const versionInfo = resolvePluginVersion(entry.name, declaredVersion, git);
			const installedVersions = uniqueStrings(
				sourceRecords
					.filter((source) => source.exists && source.version)
					.map((source) => source.version as string)
			);
			const availableVersions = uniqueStrings(
				sourceRecords.flatMap((source) => source.availableVersions ?? [])
			);
			const packageConfig: PackageConfig = {
				plugin: {
					id: pluginId,
					name: formatPackageName(entry.name),
					author: git?.author ?? undefined,
					description: missingPaths.length
						? existingPaths.length
							? `Resolved through ${existingPaths[0]}; missing ${missingPaths[0]}`
							: `Missing plugin path: ${missingPaths[0]}`
						: existingPaths.length
							? `Resolved through ${existingPaths[0]}`
							: 'No available plugin source found.',
					version: versionInfo.version,
					license:
						typeof parsed?.license === 'string' && parsed.license.trim()
							? parsed.license.trim()
							: (git?.license ?? 'Not declared'),
					source: existingPaths[0] ?? paths[0] ?? directory,
					tags: ['hconfig', origin],
					packageFile: entry.name,
					packagePath,
					origin,
					valid: !error,
					versionSource: versionInfo.source,
					gitRef: git?.ref ?? null,
					repositoryUrl: git?.repositoryUrl ?? null,
					availableVersions,
					installedVersions,
					sources: visibleSources,
					stalePaths
				},
				enabled: parsed?.enable !== false,
				valid: !error,
				packagePath,
				origin,
				paths,
				existingPaths,
				missingPaths,
				stalePaths,
				sources: visibleSources,
				error
			};

			const existing = packages.get(pluginId);
			packages.set(
				pluginId,
				existing ? mergePackageConfigs(existing, packageConfig) : packageConfig
			);
		}
	}

	return packages;
}

function mergePackageConfigs(left: PackageConfig, right: PackageConfig): PackageConfig {
	const paths = uniqueStrings([...left.paths, ...right.paths]);
	const existingPaths = uniqueStrings([...left.existingPaths, ...right.existingPaths]);
	const missingPaths = uniqueStrings([...left.missingPaths, ...right.missingPaths]);
	const stalePaths = uniqueStrings([...left.stalePaths, ...right.stalePaths]);
	const sources = mergePluginSources([...left.sources, ...right.sources]);

	return {
		...left,
		plugin: mergePluginRecords(left.plugin, right.plugin),
		enabled: left.enabled || right.enabled,
		valid: left.valid && right.valid,
		origin:
			left.origin === 'install' || left.origin === 'site'
				? left.origin
				: right.origin === 'install' || right.origin === 'site'
					? right.origin
					: left.origin,
		paths,
		existingPaths,
		missingPaths,
		stalePaths,
		sources,
		error: [left.error, right.error].filter(Boolean).join('; ') || undefined
	};
}

export function mergePluginRecords(left: PluginRecord, right: PluginRecord): PluginRecord {
	const sources = mergePluginSources([...(left.sources ?? []), ...(right.sources ?? [])]);
	const primary =
		sources.find((source) => source.exists && source.version) ??
		sources.find((source) => source.exists) ??
		sources[0];
	const knownVersion = [left, right].find((plugin) => plugin.version !== 'Unversioned');
	const officialRecord = [left, right].find(
		(plugin) => plugin.origin === 'install' || plugin.origin === 'site'
	);
	const installedVersions = uniqueStrings([
		...(left.installedVersions ?? []),
		...(right.installedVersions ?? []),
		...sources
			.filter((source) => source.exists && source.version)
			.map((source) => source.version as string)
	]);

	return {
		...left,
		origin: officialRecord?.origin ?? left.origin,
		author: left.author ?? right.author,
		valid: left.valid || right.valid,
		tags: uniqueStrings([...left.tags, ...right.tags]),
		source: primary?.path ?? left.source,
		version: primary?.version ?? knownVersion?.version ?? left.version,
		versionSource: primary?.versionSource ?? knownVersion?.versionSource ?? left.versionSource,
		gitRef: primary?.gitRef ?? left.gitRef ?? right.gitRef,
		gitTag: primary?.gitTag ?? left.gitTag ?? right.gitTag,
		gitBranch: primary?.gitBranch ?? left.gitBranch ?? right.gitBranch,
		repositoryUrl: primary?.repositoryUrl ?? left.repositoryUrl ?? right.repositoryUrl,
		availableVersions: uniqueStrings([
			...(left.availableVersions ?? []),
			...(right.availableVersions ?? []),
			...sources.flatMap((source) => source.availableVersions ?? [])
		]),
		installedVersions,
		sources,
		stalePaths: uniqueStrings([...(left.stalePaths ?? []), ...(right.stalePaths ?? [])])
	};
}

export function mergePluginSources(sources: PluginSource[]): PluginSource[] {
	const merged = new Map<string, PluginSource>();

	for (const source of sources) {
		const key = sourcePathKey(source.path);
		const existing = merged.get(key);
		if (!existing) {
			merged.set(key, { ...source });
			continue;
		}

		const preferred = existing.version ? existing : source;
		merged.set(key, {
			...existing,
			...preferred,
			exists: existing.exists || source.exists,
			gitRef: existing.gitRef ?? source.gitRef,
			gitTag: existing.gitTag ?? source.gitTag,
			gitBranch: existing.gitBranch ?? source.gitBranch,
			repositoryUrl: existing.repositoryUrl ?? source.repositoryUrl,
			availableVersions: uniqueStrings([
				...(existing.availableVersions ?? []),
				...(source.availableVersions ?? [])
			])
		});
	}

	return [...merged.values()];
}

function uniqueStrings(values: string[]): string[] {
	return [...new Set(values.filter(Boolean))];
}

function sourcePathKey(value: string): string {
	return path.normalize(value.replace(/[;]+$/, '')).toLowerCase();
}

function isManagedHpmPath(candidate: string, packageValue?: Record<string, unknown>): boolean {
	const normalized = path.normalize(candidate).toLowerCase();
	const hpmMetadata = packageValue?.hpm;
	return (
		(isRecord(hpmMetadata) && hpmMetadata.managed === true) ||
		/[\\/]hpm[\\/]plugins[\\/]/i.test(normalized)
	);
}

export function packageRoots(
	root: string,
	userPreferences: string,
	version: string,
	variables: Record<string, string>
): Array<{ directory: string; origin: PackageOrigin }> {
	const roots: Array<{ directory: string; origin: PackageOrigin }> = [
		{ directory: path.join(userPreferences, 'packages'), origin: 'user' as const },
		...(isWindows
			? [
					{
						directory: path.join(os.homedir(), 'Documents', `houdini${version}`, 'packages'),
						origin: 'user' as const
					}
				]
			: []),
		{ directory: path.join(root, 'packages'), origin: 'install' as const },
		{ directory: path.join(path.dirname(root), 'sidefx_packages'), origin: 'site' as const }
	];

	for (const directory of splitHoudiniPath(variables.HOUDINI_PACKAGE_PATH, variables)) {
		roots.push({ directory, origin: directory.includes('sidefx_packages') ? 'site' : 'unknown' });
	}

	return roots.filter(
		(item, index, all) =>
			all.findIndex(
				(candidate) => path.normalize(candidate.directory) === path.normalize(item.directory)
			) === index
	);
}

export function resolvePackagePaths(
	value: Record<string, unknown>,
	variables: Record<string, string>,
	packageDirectory: string
): string[] {
	const packageVariables = { ...variables, ...packageEnvironment(value.env) };
	const rawPaths = [...stringValues(value.path), ...stringValues(value.hpath)];
	const env = packageEnvironmentValues(value.env);
	for (const key of ['HOUDINI_PATH', 'HOUDINI_OTLSCAN_PATH', 'HOUDINI_TOOLBAR_PATH']) {
		rawPaths.push(...(env[key] ?? []));
	}

	return rawPaths
		.map((entry) => expandPackagePath(entry, packageVariables))
		.map((entry) => (path.isAbsolute(entry) ? entry : path.resolve(packageDirectory, entry)))
		.map((entry) => path.normalize(entry))
		.filter(
			(entry, index, all) =>
				entry &&
				all.findIndex((candidate) => sourcePathKey(candidate) === sourcePathKey(entry)) === index
		);
}

export async function findMissingPackagePaths(paths: string[]): Promise<string[]> {
	const results = await Promise.all(
		paths.map(async (candidate) => {
			try {
				await stat(candidate);
				return null;
			} catch {
				return candidate;
			}
		})
	);

	return results.filter((candidate): candidate is string => candidate !== null);
}

export function resolvePackageTargetStatus(
	packageConfig:
		| {
				valid: boolean;
				enabled: boolean;
				existingPaths: string[];
				missingPaths: string[];
				stalePaths?: string[];
		  }
		| undefined
): HoudiniDiscoveryResponse['targets'][number]['status'] {
	if (!packageConfig) return 'missing';
	if (!packageConfig.valid) return 'warning';
	if (packageConfig.missingPaths.length && !packageConfig.existingPaths.length) return 'missing';
	if (packageConfig.stalePaths?.length && !packageConfig.existingPaths.length) return 'missing';
	if (packageConfig.missingPaths.length) return 'warning';
	return packageConfig.enabled ? 'enabled' : 'disabled';
}

function packageEnvironment(value: unknown): Record<string, string> {
	return Object.fromEntries(
		Object.entries(packageEnvironmentValues(value)).map(([key, values]) => [
			key,
			values.join(pathDelimiter)
		])
	);
}

function packageEnvironmentValues(value: unknown): Record<string, string[]> {
	const environment: Record<string, string[]> = {};
	const entries = Array.isArray(value) ? value : isRecord(value) ? [value] : [];

	for (const entry of entries) {
		if (!isRecord(entry)) continue;
		for (const [key, rawValue] of Object.entries(entry)) {
			const values = stringValues(rawValue);
			if (values.length) environment[key] = values;
		}
	}

	return environment;
}

function stringValues(value: unknown): string[] {
	if (typeof value === 'string') return [value];
	if (Array.isArray(value))
		return value.filter((entry): entry is string => typeof entry === 'string');
	if (isRecord(value)) return stringValues(value.value);
	return [];
}

function expandPackagePath(value: string, variables: Record<string, string>): string {
	let expanded = value.trim();

	for (let pass = 0; pass < 8; pass += 1) {
		const next = expanded.replace(
			/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)|%([A-Za-z_][A-Za-z0-9_]*)%/g,
			(match, braced, dollar, percent) => variables[braced ?? dollar ?? percent] ?? match
		);
		if (next === expanded) break;
		expanded = next;
	}

	return expanded.replace(/[;]+$/, '').replace(/[/\\]+$/, '');
}

function splitHoudiniPath(value: string | undefined, variables: Record<string, string>): string[] {
	if (!value) return [];

	return value
		.split(pathDelimiter)
		.map((entry) => entry.trim())
		.filter((entry) => entry && entry !== '&' && entry !== '@')
		.map((entry) => expandHoudiniPath(entry, variables));
}

function expandHoudiniPath(value: string, variables: Record<string, string>): string {
	return value
		.replaceAll('$HFS', variables.HFS ?? '')
		.replaceAll('$HOUDINI_USER_PREF_DIR', variables.HOUDINI_USER_PREF_DIR ?? '')
		.replaceAll('$HOME', variables.HOME ?? os.homedir())
		.replaceAll('%HFS%', variables.HFS ?? '')
		.replaceAll('%HOUDINI_USER_PREF_DIR%', variables.HOUDINI_USER_PREF_DIR ?? '')
		.replace(/[/\\]+$/, '');
}

function platformFromValue(value: string | undefined): HoudiniPlatform {
	if (value?.toLowerCase().includes('windows')) return 'Windows';
	if (value?.toLowerCase().includes('linux')) return 'Linux';
	if (value?.toLowerCase().includes('mac')) return 'macOS';
	return process.platform === 'win32'
		? 'Windows'
		: process.platform === 'linux'
			? 'Linux'
			: 'Unknown';
}

function sitePackageApplies(fileName: string, version: string): boolean {
	const versions = fileName.match(/\d+\.\d+/g);
	return !versions?.length || versions.includes(version);
}

type InspectedPluginSource = {
	source: PluginSource;
	metadata: GitMetadata | null;
};

async function inspectGitSources(
	paths: string[],
	cache: Map<string, Promise<GitMetadata | null>>,
	syncRemoteGit: boolean
): Promise<InspectedPluginSource[]> {
	return Promise.all(
		paths.map(async (candidate) => {
			const exists = await pathExists(candidate);
			const key = `${path.normalize(candidate).toLowerCase()}|${syncRemoteGit ? 'remote' : 'local'}`;
			let metadataPromise = cache.get(key);
			if (!metadataPromise) {
				metadataPromise = exists ? inspectGitPath(candidate, syncRemoteGit) : Promise.resolve(null);
				cache.set(key, metadataPromise);
			}

			const metadata = await metadataPromise;
			return {
				metadata,
				source: {
					path: candidate,
					exists,
					version: metadata?.ref ?? null,
					versionSource: metadata ? 'git' : 'unknown',
					gitRef: metadata?.ref ?? null,
					gitTag: metadata?.tag ?? null,
					gitBranch: metadata?.branch ?? null,
					repositoryUrl: metadata?.repositoryUrl ?? null,
					availableVersions: metadata?.availableVersions ?? []
				}
			};
		})
	);
}

async function inspectGitPath(
	candidate: string,
	syncRemoteGit: boolean
): Promise<GitMetadata | null> {
	const runGit = async (args: string[]): Promise<string> => {
		try {
			const result = await execFileAsync('git', ['-C', candidate, ...args], {
				encoding: 'utf8',
				maxBuffer: 256 * 1024,
				timeout: 5000,
				windowsHide: true,
				env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
			});
			return result.stdout.trim();
		} catch {
			return '';
		}
	};

	const repositoryRoot = await runGit(['rev-parse', '--show-toplevel']);
	if (!repositoryRoot) return null;

	const [description, tag, branch, commit, remote, localTags, trackedFiles] = await Promise.all([
		runGit(['describe', '--tags', '--always', '--dirty']),
		runGit(['describe', '--tags', '--exact-match', 'HEAD']),
		runGit(['symbolic-ref', '--short', '-q', 'HEAD']),
		runGit(['rev-parse', '--short', 'HEAD']),
		runGit(['config', '--get', 'remote.origin.url']),
		runGit(['tag', '--sort=-version:refname']),
		runGit(['ls-tree', '-r', '--name-only', 'HEAD'])
	]);
	const remoteTags =
		syncRemoteGit && remote
			? await runGit(['ls-remote', '--tags', '--refs', '--sort=-version:refname', 'origin'])
			: '';

	const repositoryUrl = normalizeRepositoryUrl(remote);

	return {
		ref: description || commit || 'git',
		tag: tag || null,
		branch: branch || null,
		commit,
		author: githubAccountFromRepositoryUrl(repositoryUrl),
		repositoryUrl,
		license: detectLicenseFile(trackedFiles),
		availableVersions: resolveAvailableGitTags(localTags, remoteTags)
	};
}

function detectLicenseFile(trackedFiles: string): string | null {
	const licenseFile = trackedFiles.split(/\r?\n/).find((file) => {
		const name = path.basename(file).toLowerCase();
		return /^licen[cs]e(?:[._-]|$)/.test(name) || /^copying(?:[._-]|$)/.test(name);
	});
	return licenseFile ? 'License file present' : null;
}

export function resolveAvailableGitTags(localOutput: string, remoteOutput: string): string[] {
	const remoteTags = parseRemoteGitTags(remoteOutput);
	if (remoteTags.length) return remoteTags;

	return [
		...new Set(
			localOutput
				.split(/\r?\n/)
				.map((tag) => tag.trim())
				.filter(Boolean)
		)
	];
}

function parseRemoteGitTags(output: string): string[] {
	const tags: string[] = [];

	for (const line of output.split(/\r?\n/)) {
		const match = line.match(/\srefs\/tags\/(.+)$/);
		if (!match) continue;

		const tag = match[1].endsWith('^{}') ? match[1].slice(0, -3) : match[1];
		if (tag && !tags.includes(tag)) tags.push(tag);
	}

	return tags;
}

export function normalizeRepositoryUrl(remote: string): string | null {
	const value = remote.trim();
	if (!value) return null;

	if (value.startsWith('git@')) {
		const separator = value.indexOf(':');
		if (separator > 4) {
			return `https://${value.slice(4, separator)}/${value.slice(separator + 1)}`.replace(
				/\.git$/,
				''
			);
		}
	}

	if (value.startsWith('ssh://')) {
		return value.replace(/^ssh:\/\/(?:git@)?/, 'https://').replace(/\.git$/, '');
	}

	return value.replace(/\.git$/, '');
}

export function githubAccountFromRepositoryUrl(repositoryUrl: string | null): string | null {
	if (!repositoryUrl) return null;

	try {
		const url = new URL(repositoryUrl);
		if (url.hostname.toLowerCase() !== 'github.com') return null;

		const account = url.pathname.split('/').filter(Boolean)[0];
		return account ? decodeURIComponent(account) : null;
	} catch {
		return null;
	}
}

function packageId(fileName: string): string {
	return `package:${path
		.basename(fileName, path.extname(fileName))
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')}`;
}

function formatPackageName(fileName: string): string {
	return path
		.basename(fileName, path.extname(fileName))
		.replace(/[_-]+/g, ' ')
		.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function declaredPackageVersion(value: unknown): string | null {
	if (typeof value !== 'string' && typeof value !== 'number') return null;
	const version = String(value).trim();
	return version && version.toLowerCase() !== 'unversioned' ? version : null;
}

export function resolvePluginVersion(
	fileName: string,
	declaredVersion: string | null,
	git: GitMetadata | null
): { version: string; source: PluginVersionSource } {
	if (declaredVersion) return { version: declaredVersion, source: 'package' };
	if (git) return { version: git.ref, source: 'git' };

	const filenameVersion = packageVersion(fileName);
	return filenameVersion === 'Unversioned'
		? { version: filenameVersion, source: 'unknown' }
		: { version: filenameVersion, source: 'filename' };
}

function packageVersion(fileName: string): string {
	return fileName.match(/\d+(?:\.\d+){1,2}/)?.[0] ?? 'Unversioned';
}

function makeInstallId(root: string, identity: InstallIdentity): string {
	const suffix = createHash('sha1')
		.update(path.normalize(root).toLowerCase())
		.digest('hex')
		.slice(0, 8);
	return `install:${identity.version}-${identity.build}-${suffix}`;
}

function makeFailedInstall(
	root: string,
	identity: InstallIdentity,
	installId: string,
	message: string,
	scannedAt: string
): HoudiniInstall {
	const userPreferences = path.join(os.homedir(), `houdini${identity.version}`);
	return {
		id: installId,
		label: `Houdini ${identity.version}`,
		version: identity.version,
		build: identity.build,
		platform: platformFromValue(undefined),
		architecture: process.arch === 'x64' ? 'x86_64' : process.arch,
		role: 'Detected install with errors',
		hfs: root,
		hconfig: path.join(root, 'bin', hconfigName),
		userPreferences,
		packageDirectory: path.join(userPreferences, 'packages'),
		packageRoots: [],
		packageCount: 0,
		packageFiles: [],
		houdiniPath: [],
		variables: {},
		health: 'error',
		diagnostics: [message],
		scannedAt
	};
}

function compareInstalls(left: HoudiniInstall, right: HoudiniInstall): number {
	const versionCompare = compareNumericVersion(right.version, left.version);
	if (versionCompare) return versionCompare;
	return Number(right.build) - Number(left.build);
}

function compareNumericVersion(left: string, right: string): number {
	const leftParts = left.split('.').map(Number);
	const rightParts = right.split('.').map(Number);
	for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
		const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
		if (difference) return difference;
	}
	return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function directoryEntries(directory: string) {
	try {
		return await readdir(directory, { withFileTypes: true });
	} catch {
		return [];
	}
}

async function pathExists(filePath: string): Promise<boolean> {
	try {
		await stat(filePath);
		return true;
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
