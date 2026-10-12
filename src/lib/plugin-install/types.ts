import type { PackageManifestPreflight } from '$lib/houdini/types';
import type { PluginDiscoverySource } from '$lib/plugin-discovery/types';

export type InstallDialogState = 'idle' | 'working' | 'success' | 'error';

export type InstallVersionOption = {
	value: string;
	label?: string;
	kind: 'tag' | 'commit';
	isLatest?: boolean;
};

export type InstallDialogOptions = {
	openInstalledFolder: boolean;
	openInstalledConfig: boolean;
};

export type InstallDialogSelection = {
	packageFile: string;
	version: string;
	installIds: string[];
	destinationPath: string;
	correctedConfigText?: string;
};

export type InstallDialogPlugin = {
	id: string;
	name: string;
	repositoryUrl?: string | null;
	packageFile?: string;
	packageFiles?: string[];
	manifestPreflight?: Record<string, PackageManifestPreflight>;
	provenanceSource?: PluginDiscoverySource;
	pinnedCommit?: string;
	manifestBlobSha?: string;
};
