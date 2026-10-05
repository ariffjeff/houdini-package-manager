import type { PluginCatalogEntry } from './types';

export const curatedPluginCatalog: readonly PluginCatalogEntry[] = [
	{
		id: 'mops',
		pinnedCommit: 'c99890df1b007229ee46e08bd61a346da2702600',
		manifestBlobSha: 'ba2c6514d0762330300394ab87b6b8f69bd9766d',
		name: 'MOPS',
		description: 'A motion graphics toolkit for Houdini.',
		author: 'Toadstorm',
		license: 'MIT',
		repositoryUrl: 'https://github.com/toadstorm/MOPS',
		packageFile: 'MOPS.json',
		tags: ['motion graphics', 'toolkit']
	}
];

export function getPluginCatalog(): PluginCatalogEntry[] {
	return curatedPluginCatalog.map((entry) => ({ ...entry, tags: [...entry.tags] }));
}
