import { describe, expect, it } from 'vitest';
import { ingestPackageConfig, inspectPackageConfig } from './package-ingester';

const ingestionOptions = {
	hpath: 'C:/HPM/plugins/example',
	hpm: {
		managed: true,
		repository: 'https://github.com/example/plugin',
		version: 'v1.0.0'
	}
};

describe('package config ingester', () => {
	it('preserves custom repository keys while adding HPM metadata', () => {
		const result = ingestPackageConfig(
			JSON.stringify({
				path: '$PLUGIN_ROOT',
				version: '2.4.0',
				enable: false,
				custom: { keep: true },
				files: ['one.hda'],
				hpm: { sourceSetting: 'keep', managed: false }
			}),
			ingestionOptions
		);

		expect(result.inspection.fatal).toBe(false);
		expect(result.config).toEqual({
			hpath: 'C:/HPM/plugins/example',
			version: '2.4.0',
			enable: false,
			custom: { keep: true },
			files: ['one.hda'],
			hpm: { sourceSetting: 'keep', ...ingestionOptions.hpm }
		});
	});

	it('leaves HPM metadata out when no metadata options are supplied', () => {
		const result = ingestPackageConfig('{"hpath":"$PLUGIN_ROOT","enable":true}', {
			hpath: 'C:/HPM/plugins/example'
		});

		expect(result.config).toEqual({
			hpath: 'C:/HPM/plugins/example',
			enable: true
		});
	});

	it('preserves source formatting when adding HPM metadata without path fixes', () => {
		const source =
			'{\r\n' +
			'    "enable": true,\r\n' +
			'\r\n' +
			'    "custom": {\r\n' +
			'        "keep": "value"\r\n' +
			'    }\r\n' +
			'}\r\n';
		const result = ingestPackageConfig(source, {
			hpath: 'C:/HPM/plugins/example',
			applyPathFixes: false,
			hpm: ingestionOptions.hpm
		});

		expect(result.text).toBe(
			source.slice(0, -5) +
				',\r\n' +
				'    "hpm": {\r\n' +
				'        "managed": true,\r\n' +
				'        "repository": "https://github.com/example/plugin",\r\n' +
				'        "version": "v1.0.0"\r\n' +
				'    }\r\n' +
				'}\r\n'
		);
	});

	it('rejects malformed and non-object manifests', () => {
		const malformed = inspectPackageConfig('{"hpath":');
		expect(malformed.fatal).toBe(true);
		expect(malformed.issues[0]).toMatchObject({ code: 'invalid-json', severity: 'fatal' });
		expect(ingestPackageConfig('{"hpath":', ingestionOptions).config).toBeUndefined();

		const array = inspectPackageConfig('[]');
		expect(array.fatal).toBe(true);
		expect(array.issues[0]).toMatchObject({ code: 'non-object', severity: 'fatal' });
		expect(ingestPackageConfig('[]', ingestionOptions).config).toBeUndefined();
	});

	it('normalizes path aliases and reports conflicts before ingestion', () => {
		const inspected = inspectPackageConfig(
			JSON.stringify({
				hpath: 'C:/old/plugin',
				HOUDINI_PATH: 'C:/old/houdini',
				env: [{ SOURCE: '$hpath/bin' }],
				custom: 'keep'
			})
		);
		expect(inspected.issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ code: 'path-alias-conflict', severity: 'warning' })
			])
		);

		const result = ingestPackageConfig(inspected.rawText, ingestionOptions);
		expect(result.config).toEqual({
			env: [{ HOUDINI_PATH: 'C:/HPM/plugins/example', SOURCE: '$HOUDINI_PATH/bin' }],
			custom: 'keep',
			hpm: ingestionOptions.hpm
		});
	});

	it('uses the shared known-issues message for legacy path configs', () => {
		const inspection = inspectPackageConfig(JSON.stringify({ path: '$PLUGIN_ROOT', enable: true }));

		expect(inspection.issues).toContainEqual({
			code: 'deprecated-path',
			severity: 'warning',
			message: 'Package config uses deprecated path; replace it with hpath.'
		});
	});
});
