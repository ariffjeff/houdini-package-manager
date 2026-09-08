import type {
	HoudiniDiscoveryResponse,
	HoudiniScanRequest,
	InstallPluginRequest,
	InstallPluginResponse,
	HoudiniPluginAction,
	HoudiniPluginActionResponse
} from './types';

const discoveryEndpoint = '/__hpm/houdini/installs';
const scanEndpoint = '/__hpm/houdini/scan';

export async function fetchHoudiniDiscovery(): Promise<HoudiniDiscoveryResponse> {
	const response = await fetch(discoveryEndpoint, { cache: 'no-store' });
	if (!response.ok) {
		let message = `Houdini discovery failed with HTTP ${response.status}.`;
		try {
			const body = (await response.json()) as { error?: string };
			if (body.error) message = body.error;
		} catch {
			// Keep the HTTP error when the bridge did not return JSON.
		}
		throw new Error(message);
	}

	return (await response.json()) as HoudiniDiscoveryResponse;
}

export async function scanHoudiniWorkspace(
	request: HoudiniScanRequest
): Promise<HoudiniDiscoveryResponse> {
	const response = await fetch(scanEndpoint, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(request),
		cache: 'no-store'
	});
	if (!response.ok) {
		let message = `Houdini ${request.stage} scan failed with HTTP ${response.status}.`;
		try {
			const body = (await response.json()) as { error?: string };
			if (body.error) message = body.error;
		} catch {
			// Keep the HTTP error when the bridge did not return JSON.
		}
		throw new Error(message);
	}

	return (await response.json()) as HoudiniDiscoveryResponse;
}

export async function installHoudiniPlugin(
	request: InstallPluginRequest,
	signal?: AbortSignal
): Promise<InstallPluginResponse> {
	const response = await fetch('/__hpm/houdini/install', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(request),
		signal
	});
	if (!response.ok) {
		let message = `Plugin installation failed with HTTP ${response.status}.`;
		try {
			const body = (await response.json()) as { error?: string };
			if (body.error) message = body.error;
		} catch {
			// Keep the HTTP error when the bridge did not return JSON.
		}
		throw new Error(message);
	}

	return (await response.json()) as InstallPluginResponse;
}

export async function runHoudiniPluginAction(
	request: HoudiniPluginAction
): Promise<HoudiniPluginActionResponse> {
	const response = await fetch('/__hpm/houdini/plugin-action', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(request)
	});
	if (!response.ok) {
		let message = `Plugin action failed with HTTP ${response.status}.`;
		try {
			const body = (await response.json()) as { error?: string };
			if (body.error) message = body.error;
		} catch {
			// Keep the HTTP error when the bridge did not return JSON.
		}
		throw new Error(message);
	}

	return (await response.json()) as HoudiniPluginActionResponse;
}
