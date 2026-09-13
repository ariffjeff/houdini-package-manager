export type HoudiniPlatform = 'Windows' | 'Linux' | 'macOS' | 'Unknown';

export type InstallHealth = 'ready' | 'warning' | 'error';

export type PackageOrigin = 'user' | 'install' | 'site' | 'unknown';

export type PluginVersionSource = 'package' | 'git' | 'filename' | 'unknown';

export type HoudiniScanStage = 'all' | 'installs' | 'plugins' | 'git';

export type HoudiniDiscoveryStage = Exclude<HoudiniScanStage, 'all'>;

export type HoudiniScanRequest = {
	stage: HoudiniScanStage;
	pluginIds?: string[];
};

export type PluginSource = {
	path: string;
	exists: boolean;
	version: string | null;
	versionSource: PluginVersionSource;
	gitRef?: string | null;
	gitTag?: string | null;
	gitBranch?: string | null;
	repositoryUrl?: string | null;
	availableVersions?: string[];
};

export type PluginRecord = {
	id: string;
	name: string;
	author?: string;
	description: string;
	version: string;
	license: string;
	source: string;
	tags: string[];
	packageFile: string;
	packagePath: string;
	origin: PackageOrigin;
	valid: boolean;
	versionSource?: PluginVersionSource;
	gitRef?: string | null;
	gitTag?: string | null;
	gitBranch?: string | null;
	repositoryUrl?: string | null;
	gitSyncedAt?: string | null;
	availableVersions?: string[];
	installedVersions?: string[];
	sources?: PluginSource[];
	stalePaths?: string[];
};

export type HoudiniInstall = {
	id: string;
	label: string;
	version: string;
	build: string;
	platform: HoudiniPlatform;
	architecture: string;
	role: string;
	hfs: string;
	hconfig: string;
	userPreferences: string;
	packageDirectory: string;
	packageRoots: Array<{ path: string; origin: PackageOrigin }>;
	packageCount: number;
	packageFiles: string[];
	houdiniPath: string[];
	variables: Record<string, string>;
	health: InstallHealth;
	diagnostics: string[];
	scannedAt: string;
};

export type HoudiniDiscoveryDiagnostic = {
	severity: 'warning' | 'error';
	message: string;
	installId?: string;
};

export type HoudiniDiscoveryResponse = {
	installs: HoudiniInstall[];
	plugins: PluginRecord[];
	targets: Array<{
		pluginId: string;
		installId: string;
		status: 'enabled' | 'disabled' | 'warning' | 'incompatible' | 'missing';
		artifactVersion: string | null;
		packageFile: string;
		packagePath: string | null;
		origin: PackageOrigin | null;
		note: string;
	}>;
	scannedAt: string;
	stageScannedAt: Record<HoudiniDiscoveryStage, string | null>;
	gitSyncedAt: string | null;
	gitSyncedPluginIds: string[];
	persistedAt: string | null;
	source: 'live' | 'saved';
	diagnostics: HoudiniDiscoveryDiagnostic[];
};

export type InstallPluginRequest = {
	pluginId: string;
	version: string;
	installIds: string[];
	destinationPath: string;
};

export type InstallPluginResponse = {
	message: string;
	discovery: HoudiniDiscoveryResponse;
};

export type HoudiniPluginAction =
	| { action: 'open-config'; pluginId: string; installId: string }
	| { action: 'open-package-folder'; pluginId: string; installId: string }
	| { action: 'open-source'; pluginId: string; sourcePath: string }
	| { action: 'set-enabled'; pluginId: string; installId: string; enabled: boolean };

export type HoudiniPluginActionResponse = {
	message: string;
	discovery?: HoudiniDiscoveryResponse;
};
