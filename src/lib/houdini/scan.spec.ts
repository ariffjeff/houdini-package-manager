import { describe, expect, it } from 'vitest';
import { responseStageTimestamp } from './scan';
import type { HoudiniDiscoveryResponse } from './types';

const response = {
	source: 'live',
	plugins: [],
	installs: [],
	targets: [],
	scannedAt: 'installs-fallback',
	gitSyncedAt: 'git-fallback',
	stageScannedAt: { installs: null, plugins: 'plugins-stage', git: null }
} as unknown as HoudiniDiscoveryResponse;

describe('scan helpers', () => {
	it('prefers stage timestamps and falls back to response timestamps', () => {
		expect(responseStageTimestamp(response, 'plugins')).toBe('plugins-stage');
		expect(responseStageTimestamp(response, 'installs')).toBe('installs-fallback');
		expect(responseStageTimestamp(response, 'git')).toBe('git-fallback');
	});
});
