import { fetchPluginCatalog, resolvePluginRepositories } from './client';
import type { InstallDialogState } from '$lib/plugin-install/types';
import type { PluginCatalogEntry, PluginDiscoveryCandidate, PluginDiscoveryResult } from './types';

export const pluginDiscoveryState = $state({
	repositoryInput: '',
	results: [] as PluginDiscoveryResult[],
	selectedVersions: {} as Record<string, string>,
	resolveState: 'idle' as 'idle' | 'loading' | 'error',
	resolveError: '',
	catalog: [] as PluginCatalogEntry[],
	catalogState: 'loading' as 'loading' | 'ready' | 'error',
	catalogError: '',
	catalogUpdatedAt: null as number | null,
	installDialogOpen: false,
	installCandidate: null as PluginDiscoveryCandidate | null,
	installState: 'idle' as InstallDialogState,
	installMessage: ''
});

export const pluginCatalogFreshnessMs = 60_000;

let resolveController: AbortController | null = null;
let resolveRequestId = 0;
let discoveryInstallController: AbortController | null = null;

export function setDiscoveryInstallController(controller: AbortController | null): void {
	discoveryInstallController = controller;
}

export function cancelDiscoveryInstall(): void {
	discoveryInstallController?.abort();
}

export function isPluginCatalogFresh(now = Date.now()): boolean {
	return (
		pluginDiscoveryState.catalogUpdatedAt !== null &&
		now - pluginDiscoveryState.catalogUpdatedAt < pluginCatalogFreshnessMs
	);
}

export async function loadPluginCatalog(force = false): Promise<void> {
	if (!force && isPluginCatalogFresh()) return;

	pluginDiscoveryState.catalogError = '';
	if (pluginDiscoveryState.catalog.length === 0) {
		pluginDiscoveryState.catalogState = 'loading';
	}

	try {
		const response = await fetchPluginCatalog();
		pluginDiscoveryState.catalog = response.plugins;
		pluginDiscoveryState.catalogUpdatedAt = Date.now();
		pluginDiscoveryState.catalogState = 'ready';
	} catch (error) {
		pluginDiscoveryState.catalogError = error instanceof Error ? error.message : String(error);
		if (pluginDiscoveryState.catalog.length === 0) {
			pluginDiscoveryState.catalogState = 'error';
		}
	}
}

export async function resolveRepositories(urls: string[]): Promise<void> {
	resolveController?.abort();
	resolveController = new AbortController();
	const requestId = ++resolveRequestId;
	pluginDiscoveryState.resolveState = 'loading';
	pluginDiscoveryState.resolveError = '';
	pluginDiscoveryState.results = urls.map((input) => ({ input }));
	pluginDiscoveryState.selectedVersions = {};

	try {
		const response = await resolvePluginRepositories(urls, resolveController.signal);
		if (requestId !== resolveRequestId) return;
		pluginDiscoveryState.results = response.results;
		pluginDiscoveryState.selectedVersions = Object.fromEntries(
			response.results.flatMap(({ candidate }) =>
				candidate?.versions[0] ? [[candidate.id, candidate.versions[0].value]] : []
			)
		);
		pluginDiscoveryState.resolveState = 'idle';
	} catch (error) {
		if (error instanceof DOMException && error.name === 'AbortError') return;
		if (requestId !== resolveRequestId) return;
		pluginDiscoveryState.resolveState = 'error';
		pluginDiscoveryState.resolveError = error instanceof Error ? error.message : String(error);
		pluginDiscoveryState.results = urls.map((input) => ({
			input,
			error: pluginDiscoveryState.resolveError
		}));
	} finally {
		if (requestId === resolveRequestId) resolveController = null;
	}
}

export function clearResolvedRepositories(): void {
	resolveController?.abort();
	resolveController = null;
	resolveRequestId += 1;
	pluginDiscoveryState.results = [];
	pluginDiscoveryState.selectedVersions = {};
	pluginDiscoveryState.resolveError = '';
	pluginDiscoveryState.resolveState = 'idle';
}
