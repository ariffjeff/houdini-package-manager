export const HPM_STORAGE_PREFIX = 'hpm:';

export const HPM_STORAGE_KEYS = {
	activityHistory: 'hpm:activity-history',
	activitySettings: 'hpm:activity-settings',
	lastSelectedNode: 'hpm:last-selected-node',
	pinnedPluginUpdates: 'hpm:pinned-plugin-updates'
} as const;

export type HpmLocalDataKind = 'activity' | 'pinned-updates' | 'all';

export function clearHpmLocalStorage(storage: Pick<Storage, 'length' | 'key' | 'removeItem'>) {
	const keysToRemove: string[] = [];

	for (let index = 0; index < storage.length; index += 1) {
		const key = storage.key(index);
		if (key?.startsWith(HPM_STORAGE_PREFIX)) keysToRemove.push(key);
	}

	for (const key of keysToRemove) storage.removeItem(key);
}

export function clearHpmLocalData(
	storage: Pick<Storage, 'length' | 'key' | 'removeItem'>,
	kind: HpmLocalDataKind
) {
	if (kind === 'all') {
		clearHpmLocalStorage(storage);
		return;
	}

	if (kind === 'activity') {
		storage.removeItem(HPM_STORAGE_KEYS.activityHistory);
		storage.removeItem(HPM_STORAGE_KEYS.activitySettings);
		return;
	}

	storage.removeItem(HPM_STORAGE_KEYS.pinnedPluginUpdates);
}
