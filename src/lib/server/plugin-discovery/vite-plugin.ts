import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import type { ResolvePluginRepositoriesRequest } from '../../plugin-discovery/types.js';
import { getPluginCatalog } from '../../plugin-discovery/catalog.js';
import { resolvePluginRepositories } from './discovery.js';

const catalogEndpoint = '/__hpm/plugin-discovery/catalog';
const resolveEndpoint = '/__hpm/plugin-discovery/resolve';

export function pluginDiscoveryPlugin(): Plugin {
	const handleRequest = async (
		request: IncomingMessage,
		response: ServerResponse,
		next: (error?: unknown) => void
	) => {
		const url = new URL(request.url ?? '/', 'http://localhost');
		const isCatalogRequest = request.method === 'GET' && url.pathname === catalogEndpoint;
		const isResolveRequest = request.method === 'POST' && url.pathname === resolveEndpoint;
		if (!isCatalogRequest && !isResolveRequest) {
			next();
			return;
		}

		try {
			const result = isCatalogRequest
				? { plugins: getPluginCatalog() }
				: await resolvePluginRepositories(
						(await readJsonBody<ResolvePluginRepositoriesRequest>(request)).urls
					);
			response.statusCode = 200;
			response.setHeader('content-type', 'application/json; charset=utf-8');
			response.setHeader('cache-control', isCatalogRequest ? 'public, max-age=300' : 'no-store');
			response.end(JSON.stringify(result));
		} catch (error) {
			response.statusCode = 400;
			response.setHeader('content-type', 'application/json; charset=utf-8');
			response.end(
				JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
			);
		}
	};

	return {
		name: 'hpm-plugin-discovery',
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
		if (body.length > 64 * 1024) throw new Error('Plugin discovery request is too large.');
	}
	const value: unknown = JSON.parse(body);
	if (!isRecord(value)) throw new Error('Plugin discovery request must be a JSON object.');
	return value as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
