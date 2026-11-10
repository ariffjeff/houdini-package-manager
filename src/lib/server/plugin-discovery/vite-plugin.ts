import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { readJsonObject, sendJson } from '../http-json.js';
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
						(
							await readJsonObject<ResolvePluginRepositoriesRequest>(
								request,
								'Plugin discovery',
								'a JSON object'
							)
						).urls
					);
			sendJson(response, 200, result, isCatalogRequest ? 'public, max-age=300' : 'no-store');
		} catch (error) {
			sendJson(response, 400, {
				error: error instanceof Error ? error.message : String(error)
			});
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
