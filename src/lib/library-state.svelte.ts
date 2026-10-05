import type { HoudiniDiscoveryResponse } from './houdini/types';

export type LibraryViewMode = 'map' | 'table';

export const libraryNavigationState = $state({
	view: 'map' as LibraryViewMode,
	searchQuery: '',
	selectedNodeId: null as string | null,
	connectionFilterNodeId: null as string | null,
	focusNodeId: null as string | null
});

let libraryDiscoveryCache = $state.raw<HoudiniDiscoveryResponse | null>(null);

export function readLibraryDiscoveryCache(): HoudiniDiscoveryResponse | null {
	return libraryDiscoveryCache;
}

export function setLibraryDiscoveryCache(response: HoudiniDiscoveryResponse): void {
	libraryDiscoveryCache = response;
}

export function resetLibraryDiscoveryCache(): void {
	libraryDiscoveryCache = null;
}
