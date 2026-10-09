import { describe, expect, it } from 'vitest';
import {
	cancelDiscoveryInstall,
	clearResolvedRepositories,
	isPluginCatalogFresh,
	pluginCatalogFreshnessMs,
	pluginDiscoveryState,
	setDiscoveryInstallController
} from './discovery-state.svelte';

describe('plugin discovery state', () => {
	it('treats the catalog as fresh only within the freshness window', () => {
		const now = 10_000;
		pluginDiscoveryState.catalogUpdatedAt = now;

		expect(isPluginCatalogFresh(now + pluginCatalogFreshnessMs - 1)).toBe(true);
		expect(isPluginCatalogFresh(now + pluginCatalogFreshnessMs)).toBe(false);

		pluginDiscoveryState.catalogUpdatedAt = null;
	});

	it('clears resolved candidates without persistent storage', () => {
		pluginDiscoveryState.results = [{ input: 'https://github.com/example/toolkit' }];
		pluginDiscoveryState.resolveError = 'previous error';
		pluginDiscoveryState.resolveState = 'error';

		clearResolvedRepositories();

		expect(pluginDiscoveryState.results).toEqual([]);
		expect(pluginDiscoveryState.resolveError).toBe('');
		expect(pluginDiscoveryState.resolveState).toBe('idle');
	});

	it('keeps install operation state and cancellation ownership across consumers', () => {
		const controller = new AbortController();
		pluginDiscoveryState.installDialogOpen = true;
		pluginDiscoveryState.installState = 'working';
		pluginDiscoveryState.installMessage = '';
		setDiscoveryInstallController(controller);

		expect(pluginDiscoveryState.installState).toBe('working');
		expect(pluginDiscoveryState.installDialogOpen).toBe(true);

		cancelDiscoveryInstall();

		expect(controller.signal.aborted).toBe(true);
		pluginDiscoveryState.installState = 'idle';
		pluginDiscoveryState.installMessage = 'Installation cancelled.';
		setDiscoveryInstallController(null);

		expect(pluginDiscoveryState.installState).toBe('idle');
		expect(pluginDiscoveryState.installMessage).toBe('Installation cancelled.');
	});
});
