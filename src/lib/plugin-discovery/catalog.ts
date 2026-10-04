import type { PluginCatalogEntry } from './types';

export const curatedPluginCatalog: readonly PluginCatalogEntry[] = [
	{
		id: 'mops',
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
