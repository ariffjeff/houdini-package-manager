import { describe, expect, it } from 'vitest';
import { clearHpmLocalData, clearHpmLocalStorage } from './local-storage';

describe('clearHpmLocalStorage', () => {
	it('removes HPM keys without touching unrelated storage', () => {
		const values = new Map([
			['hpm:last-selected-node', 'plugin:package:mops'],
			['hpm:activity-history', '[]'],
			['other-app:preference', 'keep me']
		]);
		const storage = {
			get length() {
				return values.size;
			},
			key(index: number) {
				return [...values.keys()][index] ?? null;
			},
			removeItem(key: string) {
				values.delete(key);
			}
		};

		clearHpmLocalStorage(storage);

		expect([...values.entries()]).toEqual([['other-app:preference', 'keep me']]);
	});

	it('removes only the requested data category', () => {
		const values = new Map([
			['hpm:activity-history', 'history'],
			['hpm:activity-settings', 'settings'],
			['hpm:pinned-plugin-updates', 'pinned'],
			['hpm:last-selected-node', 'selected']
		]);
		const storage = {
			get length() {
				return values.size;
			},
			key(index: number) {
				return [...values.keys()][index] ?? null;
			},
			removeItem(key: string) {
				values.delete(key);
			}
		};

		clearHpmLocalData(storage, 'pinned-updates');

		expect([...values.keys()]).toEqual([
			'hpm:activity-history',
			'hpm:activity-settings',
			'hpm:last-selected-node'
		]);
	});
});
