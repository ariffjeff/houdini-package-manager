import { browser } from '$app/environment';

export const DEFAULT_ACTIVITY_HISTORY_RETENTION = 100;
export const MIN_ACTIVITY_HISTORY_RETENTION = 0;
export const MAX_ACTIVITY_HISTORY_RETENTION = 1000;
const activityHistoryStorageKey = 'hpm:activity-history';
const activitySettingsStorageKey = 'hpm:activity-settings';

type ActivitySettings = {
	activityHistoryRetention: number;
};

const settings = $state<ActivitySettings>({
	activityHistoryRetention: DEFAULT_ACTIVITY_HISTORY_RETENTION
});

export function normalizeActivityHistoryRetention(value: number) {
	if (!Number.isFinite(value)) return DEFAULT_ACTIVITY_HISTORY_RETENTION;
	return Math.min(
		MAX_ACTIVITY_HISTORY_RETENTION,
		Math.max(MIN_ACTIVITY_HISTORY_RETENTION, Math.round(value))
	);
}

function trimStoredActivityHistory(retention: number) {
	try {
		const stored = localStorage.getItem(activityHistoryStorageKey);
		if (!stored) return;

		const parsed: unknown = JSON.parse(stored);
		if (Array.isArray(parsed)) {
			localStorage.setItem(activityHistoryStorageKey, JSON.stringify(parsed.slice(0, retention)));
		}
	} catch {
		return;
	}
}

export function initializeActivitySettings() {
	if (!browser) return;
	settings.activityHistoryRetention = DEFAULT_ACTIVITY_HISTORY_RETENTION;

	try {
		const stored = localStorage.getItem(activitySettingsStorageKey);
		if (!stored) return;

		const parsed: unknown = JSON.parse(stored);
		if (parsed && typeof parsed === 'object' && 'activityHistoryRetention' in parsed) {
			const value = (parsed as Partial<ActivitySettings>).activityHistoryRetention;
			if (typeof value === 'number') {
				settings.activityHistoryRetention = normalizeActivityHistoryRetention(value);
			}
		}
	} catch {
		return;
	}
}

export function getActivityHistoryRetention() {
	return settings.activityHistoryRetention;
}

export function setActivityHistoryRetention(value: number) {
	const retention = normalizeActivityHistoryRetention(value);
	settings.activityHistoryRetention = retention;

	if (!browser) return retention;

	try {
		localStorage.setItem(
			activitySettingsStorageKey,
			JSON.stringify({ activityHistoryRetention: retention })
		);
		trimStoredActivityHistory(retention);
	} catch {
		return retention;
	}

	return retention;
}
