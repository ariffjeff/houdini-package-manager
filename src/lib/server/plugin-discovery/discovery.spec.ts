import { describe, expect, it } from 'vitest';
import {
	resolvePluginRepositories,
	resolvePluginRepository,
	validateRepositoryInputs
} from './discovery';

function githubFetcher(input: RequestInfo | URL) {
	const url = input.toString();
	if (url.endsWith('/repos/example/toolkit')) {
		return Promise.resolve(
			Response.json({
				name: 'toolkit',
				owner: { login: 'example' },
				description: 'A Houdini toolkit',
				default_branch: 'main',
				license: { spdx_id: 'MIT' }
			})
		);
	}
	if (url.includes('/tags?')) return Promise.resolve(Response.json([{ name: 'v2.0.0' }]));
	if (url.includes('/git/trees/')) {
		return Promise.resolve(Response.json({ tree: [{ path: 'toolkit.json', type: 'blob' }] }));
	}
	if (url.includes('raw.githubusercontent.com')) {
		return Promise.resolve(Response.json({ hpath: '$TOOLKIT', version: '2.0.0' }));
	}
	return Promise.reject(new Error(`Unexpected request: ${url}`));
}

describe('plugin repository input validation', () => {
	it('rejects empty, duplicate, and oversized input', () => {
		expect(() => validateRepositoryInputs([])).toThrow('At least one');
		expect(() =>
			validateRepositoryInputs([
				'https://github.com/example/toolkit',
				'https://github.com/example/toolkit'
			])
		).toThrow('unique');
		expect(() =>
			validateRepositoryInputs(Array.from({ length: 21 }, (_, index) => `repo-${index}`))
		).toThrow('maximum');
	});
});

describe('plugin repository discovery', () => {
	it('resolves a custom repository from one valid Houdini package manifest', async () => {
		const response = await resolvePluginRepositories(
			['https://github.com/example/toolkit'],
			githubFetcher
		);
		const result = response.results[0];
		expect(result.error).toBeUndefined();
		expect(result.candidate).toMatchObject({
			id: 'github:example/toolkit',
			name: 'toolkit',
			packageFile: 'toolkit.json',
			manifestSource: 'repository',
			source: 'github'
		});
	});

	it('keeps all JSON files and allows selecting a nested manifest when configs are ambiguous', async () => {
		const response = await resolvePluginRepositories(
			['https://github.com/example/ambiguous'],
			async (input) => {
				const url = input.toString();
				if (url.endsWith('/repos/example/ambiguous')) {
					return Response.json({
						name: 'ambiguous',
						owner: { login: 'example' },
						default_branch: 'main'
					});
				}
				if (url.includes('/tags?')) return Response.json([{ name: 'main' }]);
				if (url.includes('/git/trees/')) {
					return Response.json({
						tree: [
							{ path: 'configs/first.json', type: 'blob' },
							{ path: 'configs/second.json', type: 'blob' },
							{ path: 'README.json', type: 'blob' }
						]
					});
				}
				if (url.endsWith('/configs/first.json')) return Response.json({ hpath: '$FIRST' });
				if (url.endsWith('/configs/second.json')) return Response.json({ env: [] });
				if (url.endsWith('/README.json')) return Response.json({ title: 'readme' });
				return Promise.reject(new Error(`Unexpected request: ${url}`));
			}
		);

		const candidate = response.results[0].candidate;
		expect(candidate).toMatchObject({
			packageFile: 'configs/first.json',
			packageFiles: ['configs/first.json', 'configs/second.json', 'README.json']
		});
		expect(candidate?.warnings).toContain(
			'The repository contains multiple JSON files; review and choose the Houdini package manifest in the installer.'
		);

		const selected = await resolvePluginRepository(
			'https://github.com/example/ambiguous',
			'configs/second.json',
			async (input) => {
				const url = input.toString();
				if (url.endsWith('/repos/example/ambiguous')) {
					return Response.json({
						name: 'ambiguous',
						owner: { login: 'example' },
						default_branch: 'main'
					});
				}
				if (url.includes('/tags?')) return Response.json([{ name: 'main' }]);
				if (url.includes('/git/trees/')) {
					return Response.json({
						tree: [
							{ path: 'configs/first.json', type: 'blob' },
							{ path: 'configs/second.json', type: 'blob' }
						]
					});
				}
				if (url.endsWith('/configs/first.json')) return Response.json({ hpath: '$FIRST' });
				if (url.endsWith('/configs/second.json')) return Response.json({ env: [] });
				return Promise.reject(new Error(`Unexpected request: ${url}`));
			}
		);
		expect(selected.packageFile).toBe('configs/second.json');
	});

	it('falls back to the first JSON file and reports when no config is recognizable', async () => {
		const response = await resolvePluginRepositories(
			['https://github.com/example/unrecognized'],
			async (input) => {
				const url = input.toString();
				if (url.endsWith('/repos/example/unrecognized')) {
					return Response.json({
						name: 'unrecognized',
						owner: { login: 'example' },
						default_branch: 'main'
					});
				}
				if (url.includes('/tags?')) return Response.json([{ name: 'main' }]);
				if (url.includes('/git/trees/')) {
					return Response.json({ tree: [{ path: 'metadata.json', type: 'blob' }] });
				}
				if (url.endsWith('/metadata.json')) return Response.json({ title: 'metadata' });
				return Promise.reject(new Error(`Unexpected request: ${url}`));
			}
		);

		expect(response.results[0].candidate).toMatchObject({
			packageFile: 'metadata.json',
			packageFiles: ['metadata.json']
		});
		expect(response.results[0].candidate?.warnings).toContain(
			'No recognizable Houdini package config was found; choose a JSON file in the installer if it is the package manifest.'
		);
	});

	it('returns an unavailable candidate when the repository has no JSON files', async () => {
		const response = await resolvePluginRepositories(
			['https://github.com/example/no-manifest'],
			async (input) => {
				const url = input.toString();
				if (url.endsWith('/repos/example/no-manifest')) {
					return Response.json({
						name: 'no-manifest',
						owner: { login: 'example' },
						default_branch: 'main'
					});
				}
				if (url.includes('/tags?')) return Response.json([{ name: 'main' }]);
				if (url.includes('/git/trees/')) {
					return Response.json({ tree: [{ path: 'README.md', type: 'blob' }] });
				}
				return Promise.reject(new Error(`Unexpected request: ${url}`));
			}
		);

		expect(response.results[0].candidate).toMatchObject({ packageFile: '', packageFiles: [] });
		expect(response.results[0].candidate?.warnings).toContain(
			'No JSON package files were found; installation is unavailable for this repository.'
		);
	});

	it('exposes tags and the pinned commit for curated repositories', async () => {
		const response = await resolvePluginRepositories(
			['https://github.com/toadstorm/MOPS'],
			async (input) => {
				const url = input.toString();
				if (url.endsWith('/repos/toadstorm/MOPS')) {
					return Response.json({
						name: 'MOPS',
						owner: { login: 'toadstorm' },
						description: 'A motion graphics toolkit for Houdini.',
						default_branch: 'master',
						license: { spdx_id: 'MIT' }
					});
				}
				if (url.includes('/tags?')) {
					return Response.json([{ name: 'v2.0.0' }, { name: 'v1.9.0' }]);
				}
				if (url.includes('/git/trees/')) {
					return Response.json({ tree: [{ path: 'MOPS.json', type: 'blob' }] });
				}
				return Promise.reject(new Error(`Unexpected request: ${url}`));
			}
		);

		expect(response.results[0].candidate).toMatchObject({
			source: 'catalog',
			pinnedCommit: 'c99890df1b007229ee46e08bd61a346da2702600',
			manifestBlobSha: 'ba2c6514d0762330300394ab87b6b8f69bd9766d',
			versions: [
				{ value: 'v2.0.0', kind: 'tag', isLatest: true },
				{ value: 'v1.9.0', kind: 'tag', isLatest: false },
				{
					value: 'c99890df1b007229ee46e08bd61a346da2702600',
					label: 'Pinned commit c99890d',
					kind: 'commit'
				}
			]
		});
	});

	it('returns independent errors for malformed repositories', async () => {
		const response = await resolvePluginRepositories(
			['https://github.com/example/toolkit', 'https://gitlab.com/example/toolkit'],
			githubFetcher
		);
		expect(response.results).toHaveLength(2);
		expect(response.results[1].error).toContain('Only public github.com');
	});

	it('keeps resolving after a private repository failure', async () => {
		const fetcher = async (input: RequestInfo | URL) => {
			if (input.toString().endsWith('/repos/private/hidden')) {
				return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
			}
			return githubFetcher(input);
		};

		const response = await resolvePluginRepositories(
			['https://github.com/private/hidden', 'https://github.com/example/toolkit'],
			fetcher
		);

		expect(response.results[0].error).toBe('The GitHub repository was not found or is not public.');
		expect(response.results[1].candidate?.packageFile).toBe('toolkit.json');
	});
});
