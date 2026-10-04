import type { PluginDiscoveryVersion } from '../../plugin-discovery/types.js';

const githubApiBase = 'https://api.github.com';
const cacheDuration = 5 * 60 * 1000;
const requestTimeout = 10_000;
const repositoryPattern = /^[A-Za-z0-9_.-]+$/;
const metadataCache = new Map<string, { expiresAt: number; value: GithubRepositorySnapshot }>();

export type GithubRepository = {
	owner: string;
	repository: string;
	url: string;
	apiPath: string;
};

export type GithubRepositorySnapshot = {
	repository: GithubRepository;
	displayName: string;
	description: string;
	author: string;
	license: string;
	defaultBranch: string;
	versions: PluginDiscoveryVersion[];
	packageFiles: string[];
};

type GithubRepositoryResponse = {
	name?: unknown;
	full_name?: unknown;
	description?: unknown;
	default_branch?: unknown;
	owner?: { login?: unknown };
	license?: { spdx_id?: unknown; name?: unknown } | null;
};

type GithubTagResponse = {
	name?: unknown;
};

type GithubTreeResponse = {
	truncated?: unknown;
	tree?: Array<{ path?: unknown; type?: unknown }>;
};

export function parseGithubRepositoryUrl(input: string): GithubRepository {
	if (typeof input !== 'string' || !input.trim()) {
		throw new Error('Enter a GitHub repository URL.');
	}

	const value = input.trim();
	const sshMatch = value.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
	if (sshMatch) return createRepository(sshMatch[1], sshMatch[2]);

	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new Error('Enter a valid GitHub repository URL.');
	}

	if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com') {
		throw new Error('Only public github.com repository URLs are supported.');
	}
	if (parsed.username || parsed.password || parsed.search || parsed.hash) {
		throw new Error('GitHub repository URLs cannot include credentials, queries, or fragments.');
	}

	const segments = parsed.pathname.split('/').filter(Boolean);
	if (segments.length !== 2) {
		throw new Error('Use a repository URL such as https://github.com/owner/repository.');
	}

	return createRepository(segments[0], segments[1].replace(/\.git$/i, ''));
}

export async function resolveGithubRepository(
	input: string,
	fetcher: typeof fetch = fetch
): Promise<GithubRepositorySnapshot> {
	const repository = parseGithubRepositoryUrl(input);
	const cached = metadataCache.get(repository.url);
	if (cached && cached.expiresAt > Date.now()) return cached.value;

	const metadata = await requestGithub<GithubRepositoryResponse>(
		`${githubApiBase}${repository.apiPath}`,
		fetcher
	);
	const defaultBranchName = readString(metadata.default_branch) || 'main';
	const [tags, tree] = await Promise.all([
		requestGithub<GithubTagResponse[]>(
			`${githubApiBase}${repository.apiPath}/tags?per_page=50`,
			fetcher
		),
		requestGithub<GithubTreeResponse>(
			`${githubApiBase}${repository.apiPath}/git/trees/${encodeURIComponent(defaultBranchName)}?recursive=1`,
			fetcher
		)
	]);

	const versions = createVersions(tags, defaultBranchName);
	const packageFiles = (tree.tree ?? [])
		.filter((entry) => entry.type === 'blob' && typeof entry.path === 'string')
		.map((entry) => entry.path as string)
		.filter(isPossiblePackageFile)
		.sort((left, right) => left.localeCompare(right));
	const value: GithubRepositorySnapshot = {
		repository,
		displayName: readString(metadata.name) || repository.repository,
		description: readString(metadata.description) || 'No repository description provided.',
		author: readString(metadata.owner?.login) || repository.owner,
		license:
			readString(metadata.license?.spdx_id) || readString(metadata.license?.name) || 'Not declared',
		defaultBranch: defaultBranchName,
		versions,
		packageFiles
	};

	metadataCache.set(repository.url, { expiresAt: Date.now() + cacheDuration, value });
	return value;
}

export async function fetchGithubFile(
	repository: GithubRepository,
	ref: string,
	filePath: string,
	fetcher: typeof fetch = fetch
): Promise<string> {
	const encodedPath = filePath
		.split('/')
		.map((segment) => encodeURIComponent(segment))
		.join('/');
	const encodedRef = encodeURIComponent(ref);
	const url = `https://raw.githubusercontent.com/${repository.owner}/${repository.repository}/${encodedRef}/${encodedPath}`;
	const response = await fetcher(url, {
		headers: { 'user-agent': 'houdini-package-manager' },
		signal: AbortSignal.timeout(requestTimeout)
	});
	if (!response.ok) throw new Error(`GitHub file request failed with HTTP ${response.status}.`);
	return response.text();
}

export function clearGithubRepositoryCache(): void {
	metadataCache.clear();
}

async function requestGithub<T>(url: string, fetcher: typeof fetch): Promise<T> {
	let response: Response;
	try {
		response = await fetcher(url, {
			headers: {
				accept: 'application/vnd.github+json',
				'user-agent': 'houdini-package-manager'
			},
			signal: AbortSignal.timeout(requestTimeout)
		});
	} catch (error) {
		const cause = error instanceof Error ? error : new Error(String(error));
		throw new Error(`GitHub could not be reached: ${cause.message}`, { cause: error });
	}

	if (!response.ok) {
		if (response.status === 403 || response.status === 429) {
			throw new Error('GitHub API rate limit reached. Wait a few minutes and try again.');
		}
		if (response.status === 404) {
			throw new Error('The GitHub repository was not found or is not public.');
		}
		throw new Error(`GitHub request failed with HTTP ${response.status}.`);
	}

	return (await response.json()) as T;
}

function createRepository(owner: string, repository: string): GithubRepository {
	if (!repositoryPattern.test(owner) || !repositoryPattern.test(repository)) {
		throw new Error('The GitHub owner and repository name contain unsupported characters.');
	}

	return {
		owner,
		repository,
		url: `https://github.com/${owner}/${repository}`,
		apiPath: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`
	};
}

function createVersions(
	tags: GithubTagResponse[],
	defaultBranch: string
): PluginDiscoveryVersion[] {
	const versions = tags
		.map((tag) => readString(tag.name))
		.filter((tag): tag is string => Boolean(tag))
		.map((tag, index) => ({ value: tag, kind: 'tag' as const, isLatest: index === 0 }));
	if (versions.length) return versions;

	return [
		{
			value: defaultBranch,
			label: `${defaultBranch} (default branch)`,
			kind: 'commit',
			isLatest: true
		}
	];
}

function isPossiblePackageFile(filePath: string): boolean {
	const normalized = filePath.toLowerCase();
	if (!normalized.endsWith('.json')) return false;
	const fileName = normalized.split('/').at(-1) ?? normalized;
	return !['package.json', 'package-lock.json', 'composer.json', 'tsconfig.json'].includes(
		fileName
	);
}

function readString(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}
