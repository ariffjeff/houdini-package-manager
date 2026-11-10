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
	recordActivity?: (event: {
		kind: 'install';
		status: ActivityEventStatus;
		title: string;
		detail: string;
	}) => void;
	getErrorMessage?: (error: unknown) => string;
	postInstallActions?: (
		request: InstallPluginRequest,
		options: InstallDialogOptions,
		response: HoudiniDiscoveryResponse
	) => Promise<string[]>;
	onSuccess?: (message: string) => void;
};

type InstallRequestIdentity = Pick<
	InstallPluginRequest,
	'pluginId' | 'repositoryUrl' | 'packageFile'
>;

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
	callbacks: InstallWorkflowCallbacks,
	identity: InstallRequestIdentity = { pluginId: plugin.id }
): Promise<void> {
	const request = createInstallPluginRequest(identity, selection);
	const destinationLabels = request.installIds.map(
		(installId) => installs.find((install) => install.id === installId)?.label ?? installId
	);
	const controller = new AbortController();
	const getErrorMessage = callbacks.getErrorMessage ?? defaultErrorMessage;

	callbacks.setState('working');
	callbacks.setMessage('');
	callbacks.setController(controller);
	try {
		const result = await installHoudiniPlugin(request, controller.signal);
		callbacks.applyDiscovery(result.discovery);
		callbacks.setState('success');
		const postInstallMessages = callbacks.postInstallActions
			? await callbacks.postInstallActions(request, options, result.discovery)
			: await runDefaultPostInstallActions(plugin, request, options, getErrorMessage);
		const message = [result.message, ...postInstallMessages].join(' ');
		callbacks.setMessage(message);
		callbacks.recordActivity?.({
			kind: 'install',
			status: 'success',
			title: `Installed ${plugin.name}`,
			detail: `${request.version} · ${destinationLabels.join(', ')}`
		});
		callbacks.onSuccess?.(message);
	} catch (error) {
		if (
			controller.signal.aborted ||
			(error instanceof DOMException && error.name === 'AbortError')
		) {
			callbacks.setState('idle');
			callbacks.setMessage('Installation cancelled.');
			callbacks.recordActivity?.({
				kind: 'install',
				status: 'cancelled',
				title: `Installation cancelled for ${plugin.name}`,
				detail: `${request.version} · ${destinationLabels.join(', ')}`
			});
		} else {
			const message = getErrorMessage(error);
			callbacks.setState('error');
			callbacks.setMessage(message);
			callbacks.recordActivity?.({
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

async function runDefaultPostInstallActions(
	plugin: InstallDialogPlugin,
	request: InstallPluginRequest,
	options: InstallDialogOptions,
	getErrorMessage: (error: unknown) => string
): Promise<string[]> {
	const messages: string[] = [];
	if (options.openInstalledFolder) {
		try {
			await runHoudiniPluginAction({
				pluginId: plugin.id,
				action: 'open-source',
				sourcePath: request.destinationPath
			});
		} catch (error) {
			messages.push(getErrorMessage(error));
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
			messages.push(getErrorMessage(error));
		}
	}
	return messages;
}

function defaultErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
