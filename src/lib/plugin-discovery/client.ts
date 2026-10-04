import type { PluginCatalogResponse, ResolvePluginRepositoriesResponse } from './types';

const catalogEndpoint = '/__hpm/plugin-discovery/catalog';
const resolveEndpoint = '/__hpm/plugin-discovery/resolve';

export async function fetchPluginCatalog(): Promise<PluginCatalogResponse> {
	const response = await fetch(catalogEndpoint, { cache: 'no-store' });
	if (!response.ok) throw await pluginDiscoveryError(response, 'Plugin catalog loading failed');
	return (await response.json()) as PluginCatalogResponse;
}

export async function resolvePluginRepositories(
	urls: string[],
	signal?: AbortSignal
): Promise<ResolvePluginRepositoriesResponse> {
	const response = await fetch(resolveEndpoint, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ urls }),
		cache: 'no-store',
		signal
	});
	if (!response.ok) throw await pluginDiscoveryError(response, 'Plugin discovery failed');
	return (await response.json()) as ResolvePluginRepositoriesResponse;
}

async function pluginDiscoveryError(response: Response, fallback: string): Promise<Error> {
	try {
		const body = (await response.json()) as { error?: string };
		if (body.error) return new Error(body.error);
	} catch {
		// Keep the fallback when the endpoint did not return JSON.
	}
	return new Error(`${fallback} with HTTP ${response.status}.`);
}
