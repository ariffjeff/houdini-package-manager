import { describe, expect, it } from 'vitest';
import { availablePluginUpdates } from './plugin-detail';

describe('availablePluginUpdates', () => {
	it('does not report the base tag for an untagged commit ahead of it', () => {
		expect(
			availablePluginUpdates({
				version: 'v1.2-9-gdc60096',
				gitRef: 'v1.2-9-gdc60096',
				availableVersions: ['v1.2'],
				installedVersions: ['v1.2-9-gdc60096']
			})
		).toEqual([]);
	});

	it('reports only tags newer than the nearest tag for a non-tag commit', () => {
		expect(
			availablePluginUpdates({
				version: 'v1.2-9-gdc60096',
				gitRef: 'v1.2-9-gdc60096',
				availableVersions: ['v1.3', 'v1.2', 'v1.1'],
				installedVersions: ['v1.2-9-gdc60096']
			})
		).toEqual(['v1.3']);
	});

	it('falls back to installed version matching when no tag baseline exists', () => {
		expect(
			availablePluginUpdates({
				version: 'dc60096',
				gitRef: 'dc60096',
				availableVersions: ['v1.2', 'v1.1'],
				installedVersions: ['v1.1']
			})
		).toEqual(['v1.2']);
	});
});
