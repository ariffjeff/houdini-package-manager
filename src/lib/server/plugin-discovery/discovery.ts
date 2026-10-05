import path from 'node:path';
import { getPluginCatalog } from '../../plugin-discovery/catalog.js';
import type {
	PluginCatalogEntry,
	PluginDiscoveryCandidate,
	PluginDiscoveryResult,
	ResolvePluginRepositoriesResponse
} from '../../plugin-discovery/types.js';
import {
	fetchGithubFile,
	parseGithubRepositoryUrl,
	resolveGithubRepository,
	type GithubRepositorySnapshot
} from './github.js';

const maximumRepositories = 20;
const packageConfigKeys = new Set([
	'path',
	'hpath',
	'HOUDINI_PATH',
	'env',
	'enable',
	'load_package_once',
	'version'
]);

export function validateRepositoryInputs(urls: unknown): string[] {
	if (!Array.isArray(urls) || !urls.length) {
		throw new Error('At least one GitHub repository URL is required.');
	}
	if (urls.length > maximumRepositories) {
		throw new Error(`A maximum of ${maximumRepositories} repositories can be resolved at once.`);
	}

	const values = urls.map((url) => {
		if (typeof url !== 'string' || !url.trim())
			throw new Error('Repository URLs must be non-empty strings.');
		return url.trim();
	});
	if (new Set(values.map((url) => url.toLowerCase())).size !== values.length) {
		throw new Error('Repository URLs must be unique.');
	}
	return values;
}

export async function resolvePluginRepositories(
	urls: string[],
	fetcher: typeof fetch = fetch
): Promise<ResolvePluginRepositoriesResponse> {
	const inputs = validateRepositoryInputs(urls);
	const catalog = getPluginCatalog();
	const results: PluginDiscoveryResult[] = [];

	for (const input of inputs) {
		try {
			const repository = parseGithubRepositoryUrl(input);
			const catalogEntry = catalog.find(
				(entry) => parseGithubRepositoryUrl(entry.repositoryUrl).url === repository.url
			);
			const snapshot = await resolveGithubRepository(repository.url, fetcher);
			const candidate = await createCandidate(snapshot, catalogEntry, fetcher);
			results.push({ input, candidate });
		} catch (error) {
			results.push({
				input,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}

	return { results };
}

export async function resolvePluginRepository(
	repositoryUrl: string,
	packageFile: string | undefined,
	fetcher: typeof fetch = fetch
): Promise<PluginDiscoveryCandidate> {
	const repository = parseGithubRepositoryUrl(repositoryUrl);
	const catalogEntry = getPluginCatalog().find(
		(entry) => parseGithubRepositoryUrl(entry.repositoryUrl).url === repository.url
	);
	const snapshot = await resolveGithubRepository(repository.url, fetcher);
	const candidate = await createCandidate(snapshot, catalogEntry, fetcher);
	if (packageFile && packageFile !== candidate.packageFile) {
		throw new Error('The selected Houdini package manifest does not match the repository.');
	}
	return candidate;
}

async function createCandidate(
	snapshot: GithubRepositorySnapshot,
	catalogEntry: PluginCatalogEntry | undefined,
	fetcher: typeof fetch
): Promise<PluginDiscoveryCandidate> {
	const packageFile = catalogEntry?.packageFile ?? (await inferPackageFile(snapshot, fetcher));
	const versions = catalogEntry
		? [
				{
					value: catalogEntry.pinnedCommit,
					label: `Pinned commit ${catalogEntry.pinnedCommit.slice(0, 7)}`,
					kind: 'commit' as const,
					isLatest: true
				}
			]
		: snapshot.versions;
	const warnings: string[] = [];
	if (!catalogEntry && snapshot.packageFiles.length > 1) {
		warnings.push(
			'The repository contains multiple JSON files; one Houdini package manifest was selected.'
		);
	}
	if (packageFile.includes('/')) {
		warnings.push(
			`The package manifest is nested at ${packageFile}; HPM will install ${path.basename(packageFile)}.`
		);
	}

	return {
		id: `github:${snapshot.repository.owner}/${snapshot.repository.repository}`.toLowerCase(),
		source: catalogEntry ? 'catalog' : 'github',
		...(catalogEntry ? { catalogId: catalogEntry.id } : {}),
		...(catalogEntry ? { pinnedCommit: catalogEntry.pinnedCommit } : {}),
		...(catalogEntry ? { manifestBlobSha: catalogEntry.manifestBlobSha } : {}),
		name: catalogEntry?.name ?? snapshot.displayName,
		description: catalogEntry?.description ?? snapshot.description,
		author: catalogEntry?.author ?? snapshot.author,
		license: catalogEntry?.license ?? snapshot.license,
		repositoryUrl: snapshot.repository.url,
		owner: snapshot.repository.owner,
		repository: snapshot.repository.repository,
		defaultBranch: snapshot.defaultBranch,
		versions,
		packageFile: path.basename(packageFile),
		manifestSource: catalogEntry ? 'catalog' : 'repository',
		warnings: [...warnings],
		tags: [...(catalogEntry?.tags ?? [])]
	};
}

async function inferPackageFile(
	snapshot: GithubRepositorySnapshot,
	fetcher: typeof fetch
): Promise<string> {
	const validFiles: string[] = [];
	for (const filePath of snapshot.packageFiles.slice(0, 12)) {
		try {
			const content = await fetchGithubFile(
				snapshot.repository,
				snapshot.defaultBranch,
				filePath,
				fetcher
			);
			const parsed = JSON.parse(content) as unknown;
			if (isPackageConfig(parsed)) validFiles.push(filePath);
		} catch {
			// Invalid JSON and unavailable files are not package manifests.
		}
	}

	if (validFiles.length === 1) return validFiles[0];
	if (!validFiles.length) {
		throw new Error('No Houdini package manifest was found in this repository.');
	}
	throw new Error(`Multiple Houdini package manifests were found: ${validFiles.join(', ')}.`);
}

function isPackageConfig(value: unknown): value is Record<string, unknown> {
	if (!isRecord(value)) return false;
	return Object.keys(value).some((key) => packageConfigKeys.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
