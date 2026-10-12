import { fetchPluginCatalog, resolvePluginRepositories } from './client';
import type { InstallDialogState } from '$lib/plugin-install/types';
import type { PluginCatalogEntry, PluginDiscoveryCandidate, PluginDiscoveryResult } from './types';

const installQueueStorageKey = 'houdini-package-manager.install-queue';

function installCandidateKey(candidate: PluginDiscoveryCandidate): string {
	return `${candidate.repositoryUrl}::${candidate.packageFile}`;
}

function isPluginDiscoveryCandidate(value: unknown): value is PluginDiscoveryCandidate {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<PluginDiscoveryCandidate>;
	return (
		typeof candidate.id === 'string' &&
		typeof candidate.name === 'string' &&
		typeof candidate.repositoryUrl === 'string' &&
		typeof candidate.packageFile === 'string' &&
		Array.isArray(candidate.packageFiles) &&
		Array.isArray(candidate.versions) &&
		typeof candidate.manifestPreflight === 'object' &&
		candidate.manifestPreflight !== null
	);
}

function readInstallQueue(): {
	queue: PluginDiscoveryCandidate[];
	activeKey: string;
} {
	if (typeof localStorage === 'undefined') return { queue: [], activeKey: '' };

	try {
		const stored = JSON.parse(localStorage.getItem(installQueueStorageKey) ?? 'null') as {
			queue?: unknown;
			activeKey?: unknown;
		} | null;
		const queue = Array.isArray(stored?.queue)
			? stored.queue.filter(isPluginDiscoveryCandidate)
			: [];
		const activeKey =
			typeof stored?.activeKey === 'string' &&
			queue.some((candidate) => installCandidateKey(candidate) === stored.activeKey)
				? stored.activeKey
				: queue[0]
					? installCandidateKey(queue[0])
					: '';
		return { queue, activeKey };
	} catch {
		return { queue: [], activeKey: '' };
	}
}

const storedInstallQueue = readInstallQueue();

export const pluginDiscoveryState = $state({
	repositoryInput: '',
	results: [] as PluginDiscoveryResult[],
	resolveState: 'idle' as 'idle' | 'loading' | 'error',
	resolveError: '',
	catalog: [] as PluginCatalogEntry[],
	catalogState: 'loading' as 'loading' | 'ready' | 'error',
	catalogError: '',
	catalogUpdatedAt: null as number | null,
	installDialogOpen: storedInstallQueue.queue.length > 0,
	installQueue: storedInstallQueue.queue,
	activeInstallKey: storedInstallQueue.activeKey,
	installCandidate:
		storedInstallQueue.queue.find(
			(candidate) => installCandidateKey(candidate) === storedInstallQueue.activeKey
		) ?? null,
	installState: 'idle' as InstallDialogState,
	installMessage: ''
});

export function persistInstallQueue(): void {
	if (typeof localStorage === 'undefined') return;

	try {
		if (!pluginDiscoveryState.installQueue.length) {
			localStorage.removeItem(installQueueStorageKey);
			return;
		}
		localStorage.setItem(
			installQueueStorageKey,
			JSON.stringify({
				queue: pluginDiscoveryState.installQueue,
				activeKey: pluginDiscoveryState.activeInstallKey
			})
		);
	} catch {}
}

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

	try {
		const response = await resolvePluginRepositories(urls, resolveController.signal);
		if (requestId !== resolveRequestId) return;
		pluginDiscoveryState.results = response.results;
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
	pluginDiscoveryState.resolveError = '';
	pluginDiscoveryState.resolveState = 'idle';
}
