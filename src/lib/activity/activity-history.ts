import type { ActivityEvent } from './types';

export const ACTIVITY_HISTORY_STORAGE_KEY = 'hpm:activity-history';

export function isActivityEvent(value: unknown): value is ActivityEvent {
	if (!value || typeof value !== 'object') return false;

	const event = value as Partial<ActivityEvent>;
	return (
		typeof event.id === 'string' &&
		typeof event.timestamp === 'string' &&
		['scan', 'sync', 'plugin', 'hconfig', 'install', 'migration', 'config'].includes(
			event.kind ?? ''
		) &&
		['success', 'error', 'cancelled'].includes(event.status ?? '') &&
		typeof event.title === 'string' &&
		typeof event.detail === 'string'
	);
}

export function parseActivityEvents(value: string | null, retention: number): ActivityEvent[] {
	if (!value) return [];

	try {
		const parsed: unknown = JSON.parse(value);
		return Array.isArray(parsed) ? parsed.filter(isActivityEvent).slice(0, retention) : [];
	} catch {
		return [];
	}
}

export function limitActivityEvents(events: ActivityEvent[], retention: number) {
	return events.slice(0, retention);
}

export function readActivityEvents(storage: Pick<Storage, 'getItem'>, retention: number) {
	return parseActivityEvents(storage.getItem(ACTIVITY_HISTORY_STORAGE_KEY), retention);
}

export function writeActivityEvents(
	storage: Pick<Storage, 'setItem'>,
	events: ActivityEvent[],
	retention: number
) {
	const limitedEvents = limitActivityEvents(events, retention);
	storage.setItem(ACTIVITY_HISTORY_STORAGE_KEY, JSON.stringify(limitedEvents));
	return limitedEvents;
}
