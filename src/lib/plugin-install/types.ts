import type { InstallPluginRequest } from '$lib/houdini/types';
import type { PluginDiscoverySource, PluginDiscoveryVersion } from '$lib/plugin-discovery/types';

export type InstallDialogState = 'idle' | 'working' | 'success' | 'error';

export type InstallVersionOption = PluginDiscoveryVersion;

export type InstallDialogOptions = {
	openInstalledFolder: boolean;
	openInstalledConfig: boolean;
};

export type InstallDialogSelection = {
	version: string;
	installIds: string[];
	destinationPath: string;
};

export type InstallDialogPlugin = {
	id: string;
	name: string;
	repositoryUrl?: string | null;
	packageFile?: string;
	provenanceSource?: PluginDiscoverySource;
	pinnedCommit?: string;
	manifestBlobSha?: string;
};

export type InstallDialogRequest = InstallPluginRequest;
