import type { InstallPluginRequest } from '$lib/houdini/types';
import type { PluginDiscoveryVersion } from '$lib/plugin-discovery/types';

export type InstallDialogState = 'idle' | 'working' | 'success' | 'error';

export type InstallVersionOption = PluginDiscoveryVersion;

export type InstallDialogOptions = {
	openInstalledFolder: boolean;
	openInstalledConfig: boolean;
};

export type InstallDialogPlugin = {
	id: string;
	name: string;
	repositoryUrl?: string | null;
	packageFile?: string;
};

export type InstallDialogRequest = InstallPluginRequest;
