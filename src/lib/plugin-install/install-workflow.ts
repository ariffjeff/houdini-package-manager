import type {
	HoudiniDiscoveryResponse,
	HoudiniInstall,
	InstallPluginRequest
} from '$lib/houdini/types';
import { installHoudiniPlugin, runHoudiniPluginAction } from '$lib/houdini/client';
import type { ActivityEventStatus } from '$lib/activity/types';
import type {
	InstallDialogOptions,
	InstallDialogPlugin,
	InstallDialogSelection,
	InstallDialogState
} from './types';

export type InstallWorkflowCallbacks = {
	applyDiscovery: (response: HoudiniDiscoveryResponse) => void;
	setState: (state: InstallDialogState) => void;
	setMessage: (message: string) => void;
	setController: (controller: AbortController | null) => void;
	recordActivity: (event: {
		kind: 'install';
		status: ActivityEventStatus;
		title: string;
		detail: string;
	}) => void;
	getErrorMessage: (error: unknown) => string;
};

export function createInstallPluginRequest(
	identity: Pick<InstallPluginRequest, 'pluginId' | 'repositoryUrl' | 'packageFile'>,
	selection: InstallDialogSelection
): InstallPluginRequest {
	return {
		...identity,
		version: selection.version,
		installIds: selection.installIds,
		destinationPath: selection.destinationPath,
		includeHpmMetadata: selection.includeHpmMetadata,
		generatedConfigText: selection.generatedConfigText,
		...(selection.correctedConfigText !== undefined
			? { correctedConfigText: selection.correctedConfigText }
			: {})
	};
}

export async function runPluginInstall(
	plugin: InstallDialogPlugin,
	selection: InstallDialogSelection,
	options: InstallDialogOptions,
	installs: HoudiniInstall[],
	callbacks: InstallWorkflowCallbacks
): Promise<void> {
	const request = createInstallPluginRequest({ pluginId: plugin.id }, selection);
	const destinationLabels = request.installIds.map(
		(installId) => installs.find((install) => install.id === installId)?.label ?? installId
	);
	const controller = new AbortController();

	callbacks.setState('working');
	callbacks.setMessage('');
	callbacks.setController(controller);
	try {
		const result = await installHoudiniPlugin(request, controller.signal);
		callbacks.applyDiscovery(result.discovery);
		callbacks.setState('success');
		const postInstallMessages = [result.message];
		if (options.openInstalledFolder) {
			try {
				await runHoudiniPluginAction({
					pluginId: plugin.id,
					action: 'open-source',
					sourcePath: request.destinationPath
				});
			} catch (error) {
				postInstallMessages.push(callbacks.getErrorMessage(error));
			}
		}
		if (options.openInstalledConfig) {
			try {
				await runHoudiniPluginAction({
					pluginId: plugin.id,
					action: 'open-config',
					installId: request.installIds[0]
				});
			} catch (error) {
				postInstallMessages.push(callbacks.getErrorMessage(error));
			}
		}
		callbacks.setMessage(postInstallMessages.join(' '));
		callbacks.recordActivity({
			kind: 'install',
			status: 'success',
			title: `Installed ${plugin.name}`,
			detail: `${request.version} · ${destinationLabels.join(', ')}`
		});
	} catch (error) {
		if (
			controller.signal.aborted ||
			(error instanceof DOMException && error.name === 'AbortError')
		) {
			callbacks.setState('idle');
			callbacks.setMessage('Installation cancelled.');
			callbacks.recordActivity({
				kind: 'install',
				status: 'cancelled',
				title: `Installation cancelled for ${plugin.name}`,
				detail: `${request.version} · ${destinationLabels.join(', ')}`
			});
		} else {
			const message = callbacks.getErrorMessage(error);
			callbacks.setState('error');
			callbacks.setMessage(message);
			callbacks.recordActivity({
				kind: 'install',
				status: 'error',
				title: `Installation failed for ${plugin.name}`,
				detail: message
			});
		}
	} finally {
		callbacks.setController(null);
	}
}
