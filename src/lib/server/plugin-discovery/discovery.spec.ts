import { describe, expect, it } from 'vitest';
import { resolvePluginRepositories, validateRepositoryInputs } from './discovery';

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

	it('keeps curated repository tags visible while retaining pinned provenance', async () => {
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
				{ value: 'v1.9.0', kind: 'tag', isLatest: false }
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
