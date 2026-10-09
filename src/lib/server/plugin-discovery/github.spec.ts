import { afterEach, describe, expect, it } from 'vitest';
import {
	clearGithubRepositoryCache,
	parseGithubRepositoryUrl,
	resolveGithubRepository
} from './github';

afterEach(() => clearGithubRepositoryCache());

describe('GitHub repository parsing', () => {
	it('canonicalizes browser and SSH repository URLs', () => {
		expect(parseGithubRepositoryUrl('https://github.com/toadstorm/MOPS.git')).toMatchObject({
			owner: 'toadstorm',
			repository: 'MOPS',
			url: 'https://github.com/toadstorm/MOPS'
		});
		expect(parseGithubRepositoryUrl('git@github.com:toadstorm/MOPS.git').url).toBe(
			'https://github.com/toadstorm/MOPS'
		);
	});

	it('falls back to a license file when GitHub reports NOASSERTION', async () => {
		const fetcher = async (input: RequestInfo | URL) => {
			const url = input.toString();
			if (url.endsWith('/repos/qLab/qLib')) {
				return Response.json({
					name: 'qLib',
					owner: { login: 'qLab' },
					description: 'A procedural asset library for SideFX Houdini.',
					default_branch: 'master',
					license: { name: 'Other', spdx_id: 'NOASSERTION' }
				});
			}
			if (url.includes('/tags?')) return Response.json([]);
			if (url.includes('/git/trees/')) {
				return Response.json({ tree: [{ path: 'LICENSE', type: 'blob' }] });
			}
			throw new Error(`Unexpected request: ${url}`);
		};

		const result = await resolveGithubRepository('https://github.com/qLab/qLib', fetcher);
		expect(result.license).toBe('License file present');
	});

	it('rejects branch, file, and non-GitHub URLs', () => {
		expect(() => parseGithubRepositoryUrl('https://github.com/toadstorm/MOPS/tree/main')).toThrow(
			'Use a repository URL'
		);
		expect(() => parseGithubRepositoryUrl('https://gitlab.com/toadstorm/MOPS')).toThrow(
			'Only public github.com'
		);
	});
});

describe('GitHub repository resolution', () => {
	it('returns metadata, tags, default branch, and package files', async () => {
		const fetcher = async (input: RequestInfo | URL) => {
			const url = input.toString();
			if (url.endsWith('/repos/toadstorm/MOPS')) {
				return Response.json({
					name: 'MOPS',
					owner: { login: 'toadstorm' },
					description: 'Motion graphics toolkit',
					default_branch: 'main',
					license: { spdx_id: 'MIT' }
				});
			}
			if (url.includes('/tags?')) return Response.json([{ name: 'v1.10.0' }]);
			if (url.includes('/git/trees/')) {
				return Response.json({
					tree: [
						{ path: 'MOPS.json', type: 'blob' },
						{ path: 'package.json', type: 'blob' }
					]
				});
			}
			throw new Error(`Unexpected request: ${url}`);
		};

		const result = await resolveGithubRepository('https://github.com/toadstorm/MOPS', fetcher);
		expect(result).toMatchObject({
			displayName: 'MOPS',
			author: 'toadstorm',
			defaultBranch: 'main',
			packageFiles: ['MOPS.json']
		});
		expect(result.versions).toEqual([{ value: 'v1.10.0', kind: 'tag', isLatest: true }]);
	});
});
