export type PluginDiscoveryVersion = {
	value: string;
	label?: string;
	kind: 'tag' | 'commit';
	isLatest?: boolean;
};

export type PluginDiscoverySource = 'catalog' | 'github';

export type PluginManifestSource = 'catalog' | 'repository';

export type PluginDiscoveryCandidate = {
	id: string;
	source: PluginDiscoverySource;
	catalogId?: string;
	pinnedCommit?: string;
	manifestBlobSha?: string;
	name: string;
	description: string;
	author: string;
	license: string;
	repositoryUrl: string;
	owner: string;
	repository: string;
	defaultBranch: string;
	versions: PluginDiscoveryVersion[];
	packageFile: string;
	manifestSource: PluginManifestSource;
	warnings: string[];
	tags: string[];
	selectedVersion?: PluginDiscoveryVersion;
};

export type PluginDiscoveryResult = {
	input: string;
	candidate?: PluginDiscoveryCandidate;
	error?: string;
};

export type ResolvePluginRepositoriesRequest = {
	urls: string[];
};

export type ResolvePluginRepositoriesResponse = {
	results: PluginDiscoveryResult[];
};

export type PluginCatalogEntry = {
	id: string;
	pinnedCommit: string;
	manifestBlobSha: string;
	name: string;
	description: string;
	author: string;
	license: string;
	repositoryUrl: string;
	packageFile: string;
	tags: string[];
};

export type PluginCatalogResponse = {
	plugins: PluginCatalogEntry[];
};
