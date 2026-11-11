const repositoryPattern = /^[A-Za-z0-9_.-]+$/;

export type GithubRepository = {
	owner: string;
	repository: string;
	url: string;
	apiPath: string;
};

export function parseGithubRepositoryUrl(input: string): GithubRepository {
	if (typeof input !== 'string' || !input.trim()) {
		throw new Error('Enter a GitHub repository URL.');
	}

	const value = input.trim();
	const sshMatch = value.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
	if (sshMatch) return createRepository(sshMatch[1], sshMatch[2]);
	const url = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`;

	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error('Enter a valid GitHub repository URL.');
	}

	const hostname = parsed.hostname.toLowerCase();
	if (parsed.protocol !== 'https:' || !['github.com', 'www.github.com'].includes(hostname)) {
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

export function normalizeGithubRepositoryUrl(input: string): string {
	try {
		return parseGithubRepositoryUrl(input).url.toLocaleLowerCase();
	} catch {
		return input.trim().replace(/\/+$/, '').toLocaleLowerCase();
	}
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
