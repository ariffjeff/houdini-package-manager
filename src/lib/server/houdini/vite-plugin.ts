import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import type { HoudiniScanRequest, InstallPluginRequest } from '../../houdini/types.js';
import { discoverHoudiniWorkspace, scanHoudiniWorkspace } from './discovery.js';
import { installHoudiniPlugin } from './installer.js';

const endpoint = '/__hpm/houdini/installs';
const scanEndpoint = '/__hpm/houdini/scan';
const installEndpoint = '/__hpm/houdini/install';

export function houdiniDiscoveryPlugin(): Plugin {
	const handleRequest = async (
		request: IncomingMessage,
		response: ServerResponse,
		next: (error?: unknown) => void
	) => {
		const url = new URL(request.url ?? '/', 'http://localhost');
		const isDiscoveryRequest = request.method === 'GET' && url.pathname === endpoint;
		const isScanRequest = request.method === 'POST' && url.pathname === scanEndpoint;
		const isInstallRequest = request.method === 'POST' && url.pathname === installEndpoint;
		if (!isDiscoveryRequest && !isScanRequest && !isInstallRequest) {
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
				: isScanRequest
					? await scanHoudiniWorkspace(await readJsonBody<HoudiniScanRequest>(request))
					: await installHoudiniPlugin(
							await readJsonBody<InstallPluginRequest>(request),
							abortController.signal
						);
			response.statusCode = 200;
			response.setHeader('content-type', 'application/json; charset=utf-8');
			response.setHeader('cache-control', 'no-store');
			response.end(JSON.stringify(result));
		} catch (error) {
			response.statusCode = 500;
			response.setHeader('content-type', 'application/json; charset=utf-8');
			response.end(
				JSON.stringify({
					error: error instanceof Error ? error.message : String(error)
				})
			);
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

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
	let body = '';
	for await (const chunk of request) {
		body += chunk.toString();
		if (body.length > 64 * 1024) throw new Error('Install request is too large.');
	}
	const value: unknown = JSON.parse(body);
	if (!isRecord(value)) throw new Error('Install request must be a JSON object.');
	return value as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
