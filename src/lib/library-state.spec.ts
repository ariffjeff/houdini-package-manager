import { afterEach, describe, expect, it } from 'vitest';
import type { HoudiniDiscoveryResponse } from './houdini/types';
import {
	readLibraryDiscoveryCache,
	resetLibraryDiscoveryCache,
	setLibraryDiscoveryCache
} from './library-state.svelte';

const response = {
	installs: [],
	plugins: [],
	targets: [],
	scannedAt: '2026-10-04T00:00:00.000Z',
	stageScannedAt: { installs: null, plugins: null, git: null },
	gitSyncedAt: null,
	gitSyncedPluginIds: [],
	persistedAt: null,
	source: 'live',
	diagnostics: []
} as HoudiniDiscoveryResponse;

afterEach(() => {
	resetLibraryDiscoveryCache();
});

describe('library discovery cache', () => {
	it('reads the latest response after setting it', () => {
		expect(readLibraryDiscoveryCache()).toBeNull();

		setLibraryDiscoveryCache(response);

		expect(readLibraryDiscoveryCache()).toBe(response);
	});

	it('replaces an existing response', () => {
		const nextResponse = { ...response, scannedAt: '2026-10-04T00:01:00.000Z' };
		setLibraryDiscoveryCache(response);

		setLibraryDiscoveryCache(nextResponse);

		expect(readLibraryDiscoveryCache()).toBe(nextResponse);
	});

	it('resets the response without persistent storage', () => {
		setLibraryDiscoveryCache(response);

		resetLibraryDiscoveryCache();

		expect(readLibraryDiscoveryCache()).toBeNull();
	});
});
