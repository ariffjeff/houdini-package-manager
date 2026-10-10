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

type PackageFileInference = {
	packageFile: string;
	recognized: boolean;
};

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
	if (packageFile && !candidate.packageFiles.includes(packageFile)) {
		throw new Error('The selected Houdini package manifest does not match the repository.');
	}
	return packageFile ? { ...candidate, packageFile } : candidate;
}

async function createCandidate(
	snapshot: GithubRepositorySnapshot,
	catalogEntry: PluginCatalogEntry | undefined,
	fetcher: typeof fetch
): Promise<PluginDiscoveryCandidate> {
	const inference = catalogEntry
		? { packageFile: catalogEntry.packageFile, recognized: true }
		: await inferPackageFile(snapshot, fetcher);
	const packageFile = inference.packageFile;
	const versions = catalogEntry
		? [
				...snapshot.versions,
				{
					value: catalogEntry.pinnedCommit,
					label: `Pinned commit ${catalogEntry.pinnedCommit.slice(0, 7)}`,
					kind: 'commit' as const
				}
			].filter(
				(version, index, allVersions) =>
					allVersions.findIndex((candidate) => candidate.value === version.value) === index
			)
		: snapshot.versions;
	const warnings: string[] = [];
	if (!catalogEntry && snapshot.packageFiles.length > 1) {
		warnings.push(
			'The repository contains multiple JSON files; review and choose the Houdini package manifest in the installer.'
		);
	}
	if (!catalogEntry && snapshot.packageFiles.length === 0) {
		warnings.push(
			'No JSON package files were found; installation is unavailable for this repository.'
		);
	} else if (!catalogEntry && !inference.recognized) {
		warnings.push(
			'No recognizable Houdini package config was found; choose a JSON file in the installer if it is the package manifest.'
		);
	}
	if (packageFile.includes('/')) {
		warnings.push(
			`The package manifest is nested at ${packageFile}; HPM will preserve that repository-relative path.`
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
		packageFile,
		packageFiles: catalogEntry ? [catalogEntry.packageFile] : [...snapshot.packageFiles],
		manifestSource: catalogEntry ? 'catalog' : 'repository',
		warnings: [...warnings],
		tags: [...(catalogEntry?.tags ?? [])]
	};
}

async function inferPackageFile(
	snapshot: GithubRepositorySnapshot,
	fetcher: typeof fetch
): Promise<PackageFileInference> {
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

	return {
		packageFile: validFiles[0] ?? snapshot.packageFiles[0] ?? '',
		recognized: validFiles.length > 0
	};
}

function isPackageConfig(value: unknown): value is Record<string, unknown> {
	if (!isRecord(value)) return false;
	return Object.keys(value).some((key) => packageConfigKeys.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
