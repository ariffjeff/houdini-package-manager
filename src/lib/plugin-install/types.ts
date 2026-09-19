import type { InstallPluginRequest } from '$lib/houdini/types';

export type InstallDialogState = 'idle' | 'working' | 'success' | 'error';

export type InstallVersionOption = {
	value: string;
	kind: 'tag' | 'commit';
};

export type InstallDialogOptions = {
	openInstalledFolder: boolean;
	openInstalledConfig: boolean;
};

export type InstallDialogRequest = InstallPluginRequest;
