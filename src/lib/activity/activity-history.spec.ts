import { describe, expect, it } from 'vitest';
import { limitActivityEvents, parseActivityEvents, writeActivityEvents } from './activity-history';
import type { ActivityEvent } from './types';

const event: ActivityEvent = {
	id: 'event-1',
	timestamp: '2026-01-01T00:00:00.000Z',
	kind: 'scan',
	status: 'success',
	title: 'Scan complete',
	detail: 'Workspace'
};

describe('activity history helpers', () => {
	it('parses only valid events and applies retention', () => {
		expect(parseActivityEvents(JSON.stringify([event, { invalid: true }]), 1)).toEqual([event]);
	});

	it('limits and persists events through a storage-like object', () => {
		const storage = { setItem: (_key: string, value: string) => value };
		expect(limitActivityEvents([event, { ...event, id: 'event-2' }], 1)).toEqual([event]);
		expect(writeActivityEvents(storage, [event], 1)).toEqual([event]);
	});
});
