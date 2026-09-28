import { describe, expect, it } from 'vitest';
import { expandWindowsShortPaths } from './hconfig.js';

describe('expandWindowsShortPaths', () => {
	it('expands existing short path segments while preserving unresolved values and separators', async () => {
		const resolvedPaths = new Map([
			[
				'C:/PROGRA~1/SIDEEF~1/HOUDIN~1.368',
				'C:\\Program Files\\Side Effects Software\\Houdini 18.0.368'
			],
			[
				'C:\\PROGRA~1\\Side Effects Software\\Houdini',
				'C:\\Program Files\\Side Effects Software\\Houdini'
			],
			['C:\\Users\\TESTUS~1\\AppData\\Local', 'C:\\Users\\Test User\\AppData\\Local']
		]);
		await expect(
			expandWindowsShortPaths(
				"HFS := 'C:/PROGRA~1/SIDEEF~1/HOUDIN~1.368'\n" +
					'HFS_ALT := C:\\PROGRA~1\\Side Effects Software\\Houdini\n' +
					'H_PATH := C:\\Users\\TESTUS~1\\AppData\\Local;C:\\missing\\MISSING~1',
				async (value) => {
					const resolved = resolvedPaths.get(value);
					if (!resolved) throw new Error('not found');
					return resolved;
				}
			)
		).resolves.toBe(
			"HFS := 'C:/Program Files/Side Effects Software/Houdini 18.0.368'\n" +
				'HFS_ALT := C:\\Program Files\\Side Effects Software\\Houdini\n' +
				'H_PATH := C:\\Users\\Test User\\AppData\\Local;C:\\missing\\MISSING~1'
		);
	});
});
