import type { InstallPluginRequest } from '$lib/houdini/types';

export type InstallDialogState = 'idle' | 'working' | 'success' | 'error';

export type InstallDialogOptions = {
	openInstalledFolder: boolean;
	openInstalledConfig: boolean;
};

export type InstallDialogRequest = InstallPluginRequest;
