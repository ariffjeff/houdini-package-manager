import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { readJsonObject, sendJson } from '../http-json.js';
import type {
	HoudiniPluginAction,
	HoudiniScanRequest,
	InstallPluginRequest
} from '../../houdini/types.js';
import {
	clearHoudiniDiscoveryCache,
	discoverHoudiniWorkspace,
	loadHoudiniDiscoverySnapshot,
	scanHoudiniWorkspace
} from './discovery.js';
import { installHoudiniPlugin, runHoudiniPluginAction } from './installer.js';

const endpoint = '/__hpm/houdini/installs';
const snapshotEndpoint = '/__hpm/houdini/snapshot';
const clearCacheEndpoint = '/__hpm/houdini/clear-cache';
const scanEndpoint = '/__hpm/houdini/scan';
const installEndpoint = '/__hpm/houdini/install';
const pluginActionEndpoint = '/__hpm/houdini/plugin-action';

export function houdiniDiscoveryPlugin(): Plugin {
	const handleRequest = async (
		request: IncomingMessage,
		response: ServerResponse,
		next: (error?: unknown) => void
	) => {
		const url = new URL(request.url ?? '/', 'http://localhost');
		const isDiscoveryRequest = request.method === 'GET' && url.pathname === endpoint;
		const isSnapshotRequest = request.method === 'GET' && url.pathname === snapshotEndpoint;
		const isClearCacheRequest = request.method === 'POST' && url.pathname === clearCacheEndpoint;
		const isScanRequest = request.method === 'POST' && url.pathname === scanEndpoint;
		const isInstallRequest = request.method === 'POST' && url.pathname === installEndpoint;
		const isPluginActionRequest =
			request.method === 'POST' && url.pathname === pluginActionEndpoint;
		if (
			!isDiscoveryRequest &&
			!isSnapshotRequest &&
			!isClearCacheRequest &&
			!isScanRequest &&
			!isInstallRequest &&
			!isPluginActionRequest
		) {
			next();
			return;
		}

		try {
			const abortController = new AbortController();
			const abortInstall = () => {
				if (!response.writableEnded) abortController.abort();
			};
			request.once('aborted', abortInstall);
			response.once('close', abortInstall);
			const result = isDiscoveryRequest
				? await discoverHoudiniWorkspace()
				: isSnapshotRequest
					? await loadHoudiniDiscoverySnapshot()
					: isClearCacheRequest
						? await clearHoudiniDiscoveryCache()
						: isScanRequest
							? await scanHoudiniWorkspace(
									await readJsonObject<HoudiniScanRequest>(request, 'Install')
								)
							: isInstallRequest
								? await installHoudiniPlugin(
										await readJsonObject<InstallPluginRequest>(request, 'Install'),
										abortController.signal
									)
								: await runHoudiniPluginAction(
										await readJsonObject<HoudiniPluginAction>(request, 'Install'),
										abortController.signal
									);
			if (isSnapshotRequest && !result) {
				sendJson(response, 404, { error: 'No saved Houdini discovery snapshot exists.' });
				return;
			}
			sendJson(response, 200, isClearCacheRequest ? { cleared: true } : result, 'no-store');
		} catch (error) {
			sendJson(response, 500, {
				error: error instanceof Error ? error.message : String(error)
			});
		}
	};

	return {
		name: 'hpm-houdini-discovery',
		configureServer(server) {
			server.middlewares.use(handleRequest);
		},
		configurePreviewServer(server) {
			server.middlewares.use(handleRequest);
		}
	};
}
