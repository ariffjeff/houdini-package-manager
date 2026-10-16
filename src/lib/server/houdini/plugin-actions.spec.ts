import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writePackageConfigText } from './plugin-actions';

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true }))
	);
});

describe('writePackageConfigText', () => {
	it('validates the object root and preserves manual formatting', async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), 'hpm-package-action-'));
		temporaryDirectories.push(directory);
		const packagePath = path.join(directory, 'package.json');
		const configText = '{\r\n  "enable": true\r\n}\r\n\r\n';

		await writePackageConfigText(packagePath, configText);

		expect(await readFile(packagePath, 'utf8')).toBe('{\r\n  "enable": true\r\n}\n');
	});

	it.each(['{', '[]', ''])('rejects invalid manual config text: %s', async (configText) => {
		const directory = await mkdtemp(path.join(os.tmpdir(), 'hpm-package-action-'));
		temporaryDirectories.push(directory);
		const packagePath = path.join(directory, 'package.json');

		await expect(writePackageConfigText(packagePath, configText)).rejects.toThrow();
	});
});
