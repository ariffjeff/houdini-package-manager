<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import ActivityConsole from '$lib/activity/ActivityConsole.svelte';
	import { readActivityEvents, writeActivityEvents } from '$lib/activity/activity-history';
	import type { ActivityEvent, ActivityEventStatus } from '$lib/activity/types';
	import ActivationWorkspace from '$lib/activation-map/ActivationWorkspace.svelte';
	import ActivationDialogs from '$lib/activation-map/ActivationDialogs.svelte';
	import type { TargetIssueDetails } from '$lib/activation-map/target-issue-dialog';
	import {
		getActivityHistoryRetention,
		initializeActivitySettings
	} from '$lib/settings/activity-settings.svelte';
	import {
		createActivationGraph,
		isOfficialPlugin,
		OFFICIAL_NODE_ID
	} from '$lib/activation-map/model';
	import {
		availablePluginUpdates,
		compareVersionLabels,
		createPluginTargetGroups,
		gitCommitOption,
		isGitTagVersion,
		type PluginDetailAction,
		type PluginDetailActionState
	} from '$lib/activation-map/plugin-detail';
	import {
		createPluginUpdateItems,
		pinPluginUpdate,
		readPinnedPluginUpdates,
		unpinPluginUpdate,
		updatePreferenceKey,
		writePinnedPluginUpdates,
		type PinnedPluginUpdates,
		type PluginUpdateItem
	} from '$lib/activation-map/update-checker';
	import {
		createIssueConfigOptions,
		createIssueItems,
		issueFilterForTarget,
		issueFilterId,
		type IssueItem
	} from '$lib/activation-map/issue-checker';
	import type {
		ActivationEdge,
		ActivationNode,
		ActivationTarget,
		HoudiniInstall,
		PluginRecord
	} from '$lib/activation-map/types';
	import { targetIssueMessages, targetIssueSummary } from '$lib/houdini/known-issues';
	import type { HoudiniDiscoveryResponse, HoudiniPluginMigrationRequest } from '$lib/houdini/types';
	import {
		responseStageTimestamp,
		scanStages,
		type ScanAction,
		type ScanStage,
		type ScanState,
		type ScanStatus
	} from '$lib/houdini/scan';
	import { createScanOrchestrator } from '$lib/houdini/scan-orchestrator.svelte';
	import type {
		InstallDialogOptions,
		InstallDialogRequest,
		InstallDialogPlugin,
		InstallDialogSelection,
		InstallVersionOption
	} from '$lib/plugin-install/types';
	import AppHeader from '$lib/AppHeader.svelte';
	import {
		libraryNavigationState,
		readLibraryDiscoveryCache,
		setLibraryDiscoveryCache
	} from '$lib/library-state.svelte';
	import {
		fetchHoudiniDiscoverySnapshot,
		installHoudiniPlugin,
		runHoudiniPluginAction
	} from '$lib/houdini/client';
	import { HPM_STORAGE_KEYS } from '$lib/settings/local-storage';
	import Tooltip from '$lib/Tooltip.svelte';

	type LiveJsonEditorContext = {
		plugin: PluginRecord;
		install: HoudiniInstall;
		target: ActivationTarget;
	};

	const selectedNodeStorageKey = HPM_STORAGE_KEYS.lastSelectedNode;
	const pinnedPluginUpdatesStorageKey = HPM_STORAGE_KEYS.pinnedPluginUpdates;
	const cachedDiscovery = readLibraryDiscoveryCache();

	let activeScan = $state<ScanAction | null>(null);
	let initialScanStarted = false;
	let hasDiscoverySnapshot = $state(cachedDiscovery !== null);
	let snapshotLoadState = $state<ScanState>(cachedDiscovery ? 'ready' : 'pending');
	let scanStatuses = $state<Record<ScanStage, ScanStatus>>({
		installs: { state: 'pending', error: '', source: 'none', scannedAt: null },
		plugins: { state: 'pending', error: '', source: 'none', scannedAt: null },
		git: { state: 'pending', error: '', source: 'none', scannedAt: null }
	});
	let activationPlugins = $state<PluginRecord[]>(cachedDiscovery?.plugins ?? []);
	let activationInstalls = $state<HoudiniInstall[]>(cachedDiscovery?.installs ?? []);
	let activationTargets = $state<ActivationTarget[]>(cachedDiscovery?.targets ?? []);
	let installDialogOpen = $state(false);
	let installState = $state<'idle' | 'working' | 'success' | 'error'>('idle');
	let installMessage = $state('');
	let installController: AbortController | null = null;
	let pluginMigratorOpen = $state(false);
	let migrationState = $state<'idle' | 'working' | 'success' | 'error'>('idle');
	let migrationMessage = $state('');
	let gitSyncState = $state<PluginDetailActionState>('idle');
	let gitSyncMessage = $state('');
	let pluginScanState = $state<PluginDetailActionState>('idle');
	let pluginActionState = $state<PluginDetailActionState>('idle');
	let issuesDialogOpen = $state(false);
	let updatesDialogOpen = $state(false);
	let issueCheckerFilterId = $state('all');
	let pinnedPluginUpdates = $state<PinnedPluginUpdates>({});
	let groupIssueBuilds = $state(false);
	let targetIssueDetails = $state<TargetIssueDetails | null>(null);
	let liveJsonEditorContext = $state<LiveJsonEditorContext | null>(null);
	let activityEvents = $state<ActivityEvent[]>([]);
	let activitySequence = 0;

	let activationGraph = $derived(
		createActivationGraph(activationPlugins, activationInstalls, activationTargets)
	);
	let activationNodes = $derived<ActivationNode[]>(activationGraph.nodes);
	let activationEdges = $derived<ActivationEdge[]>(activationGraph.edges);
	let scanError = $derived.by(() => {
		const failedStage = scanStages.find(({ stage }) => scanStatuses[stage].state === 'error');
		return failedStage ? scanStatuses[failedStage.stage].error : '';
	});
	let discoveryState = $derived<'loading' | 'ready' | 'error'>(
		!hasDiscoverySnapshot &&
			(snapshotLoadState === 'pending' || snapshotLoadState === 'loading' || activeScan === 'all')
			? 'loading'
			: scanError && !hasDiscoverySnapshot
				? 'error'
				: 'ready'
	);
	let isScanActive = $derived(activeScan !== null);
	let enabledCount = $derived(
		activationTargets.filter((target) => target.status === 'enabled').length
	);
	let pluginCount = $derived(
		new Set(
			activationPlugins.filter((plugin) => !isOfficialPlugin(plugin)).map((plugin) => plugin.id)
		).size
	);
	let issueItems = $derived(
		createIssueItems(activationTargets, activationPlugins, activationInstalls)
	);
	let attentionCount = $derived(issueItems.length);
	let allPluginUpdateItems = $derived(
		createPluginUpdateItems(activationTargets, activationPlugins, activationInstalls)
	);
	let pluginUpdateItems = $derived(
		allPluginUpdateItems.filter((update) => !pinnedPluginUpdates[updatePreferenceKey(update)])
	);
	let pinnedPluginUpdateItems = $derived(
		allPluginUpdateItems.filter((update) => pinnedPluginUpdates[updatePreferenceKey(update)])
	);
	let updateCount = $derived(pluginUpdateItems.length);
	let issueConfigOptions = $derived(
		createIssueConfigOptions(activationTargets, activationInstalls)
	);
	let normalizedQuery = $derived(libraryNavigationState.searchQuery.trim().toLowerCase());
	let selectedGraphNodeId = $derived.by(() => {
		if (!libraryNavigationState.selectedNodeId) return null;
		if (activationNodes.some((node) => node.id === libraryNavigationState.selectedNodeId)) {
			return libraryNavigationState.selectedNodeId;
		}

		if (libraryNavigationState.selectedNodeId.startsWith('plugin:')) {
			const pluginId = libraryNavigationState.selectedNodeId.slice('plugin:'.length);
			const plugin = activationPlugins.find((item) => item.id === pluginId);
			if (plugin && isOfficialPlugin(plugin)) return OFFICIAL_NODE_ID;
		}

		return libraryNavigationState.selectedNodeId;
	});
	let filterButtonIsActive = $derived(
		libraryNavigationState.connectionFilterNodeId !== null &&
			(selectedGraphNodeId === null ||
				libraryNavigationState.connectionFilterNodeId === selectedGraphNodeId)
	);
	let selectedNode = $derived(
		selectedGraphNodeId
			? activationNodes.find((node) => node.id === selectedGraphNodeId)
			: undefined
	);
	let selectedPlugin = $derived(
		selectedNode?.data.kind === 'plugin'
			? activationPlugins.find((plugin) => `plugin:${plugin.id}` === selectedNode.id)
			: undefined
	);
	let selectedInstall = $derived(
		selectedNode?.data.kind === 'install'
			? activationInstalls.find((install) => install.id === selectedNode.id)
			: undefined
	);
	let selectedOfficialPlugins = $derived(
		selectedNode?.data.kind === 'official' ? activationPlugins.filter(isOfficialPlugin) : []
	);
	let selectedPluginVersions = $derived(selectedPlugin?.availableVersions ?? []);
	let selectedPluginCommitOption = $derived(
		selectedPlugin ? gitCommitOption(selectedPlugin) : null
	);
	let selectedPluginVersionOptions = $derived<InstallVersionOption[]>(
		[
			...(selectedPluginCommitOption ? [selectedPluginCommitOption] : []),
			...selectedPluginVersions.map<InstallVersionOption>((version) => ({
				value: version,
				kind: isGitTagVersion(version) ? ('tag' as const) : ('commit' as const)
			}))
		]
			.sort((left, right) =>
				compareVersionLabels(right.label ?? right.value, left.label ?? left.value)
			)
			.map((option, index) => ({ ...option, isLatest: index === 0 }))
	);
	let selectedPluginUpdates = $derived(
		selectedPlugin
			? availablePluginUpdates(selectedPlugin).filter((version) =>
					pluginUpdateItems.some(
						(update) => update.pluginId === selectedPlugin.id && update.latestVersion === version
					)
				)
			: []
	);
	let remoteSourceOptions = $derived.by(() => {
		const sourcePaths = (selectedPlugin?.sources ?? [])
			.filter((source) => source.exists)
			.map((source) => source.path);
		const hpmPath = hpmPluginDestination;
		return [...new Set(hpmPath ? [...sourcePaths, hpmPath] : sourcePaths)];
	});
	let hpmPluginDestination = $derived.by(() => {
		const plugin = selectedPlugin;
		if (!plugin) return '';

		const staleHpmPath = plugin.stalePaths?.find((sourcePath) =>
			/[\\/]hpm[\\/]plugins[\\/]/i.test(sourcePath)
		);
		if (staleHpmPath) return staleHpmPath;

		const userPreferences = activationInstalls[0]?.userPreferences;
		const pluginSlug = plugin.id.split(':').at(-1)?.trim();
		if (!userPreferences || !pluginSlug) return '';

		const separator = userPreferences.includes('\\') ? '\\' : '/';
		const documentsPath = userPreferences.replace(/[\\/]houdini[^\\/]*$/i, '');
		return `${documentsPath}${separator}HPM${separator}plugins${separator}${pluginSlug}`;
	});
	let installPlugin = $derived<InstallDialogPlugin | undefined>(selectedPlugin);
	let installVersionOptions = $derived<InstallVersionOption[]>(selectedPluginVersionOptions);
	let installRemoteSourceOptions = $derived(remoteSourceOptions);
	let installHpmPluginDestination = $derived(hpmPluginDestination);
	let filteredPlugins = $derived.by(() => {
		if (!normalizedQuery) return activationPlugins;

		return activationPlugins.filter((plugin) =>
			[plugin.name, plugin.version, plugin.source, ...plugin.tags]
				.join(' ')
				.toLowerCase()
				.includes(normalizedQuery)
		);
	});
	let selectedConnectedNodeIds = $derived.by(() => {
		if (!selectedGraphNodeId) return null;

		const connectedNodeIds = new SvelteSet([selectedGraphNodeId]);
		for (const edge of activationEdges) {
			if (edge.source === selectedGraphNodeId || edge.target === selectedGraphNodeId) {
				connectedNodeIds.add(edge.source);
				connectedNodeIds.add(edge.target);
			}
		}

		return connectedNodeIds;
	});
	let mapNodes = $derived(
		activationNodes.map((node) => ({
			...node,
			selected: node.id === selectedGraphNodeId,
			data: {
				...node.data,
				dimmed: selectedConnectedNodeIds !== null && !selectedConnectedNodeIds.has(node.id)
			}
		}))
	);
	let visibleMapNodes = $derived.by(() => {
		let candidateNodes = mapNodes;
		if (libraryNavigationState.connectionFilterNodeId) {
			const connectedNodeIds = new SvelteSet([libraryNavigationState.connectionFilterNodeId]);
			for (const edge of activationEdges) {
				if (
					edge.source === libraryNavigationState.connectionFilterNodeId ||
					edge.target === libraryNavigationState.connectionFilterNodeId
				) {
					connectedNodeIds.add(edge.source);
					connectedNodeIds.add(edge.target);
				}
			}
			candidateNodes = mapNodes.filter((node) => connectedNodeIds.has(node.id));
		}

		if (!normalizedQuery) return candidateNodes;

		const matchingPluginIds = filteredPlugins.map((plugin) => `plugin:${plugin.id}`);
		const matchingIds = activationNodes
			.filter((node) => matchingPluginIds.includes(node.id))
			.map((node) => node.id);
		if (filteredPlugins.some(isOfficialPlugin) && !matchingIds.includes(OFFICIAL_NODE_ID)) {
			matchingIds.push(OFFICIAL_NODE_ID);
		}

		for (const edge of activationEdges) {
			if (matchingIds.includes(edge.source) && !matchingIds.includes(edge.target)) {
				matchingIds.push(edge.target);
			}
		}

		return candidateNodes.filter((node) => matchingIds.includes(node.id));
	});
	let visibleNodeIds = $derived(visibleMapNodes.map((node) => node.id));
	// Compute the edges that are visible based on the currently visible nodes and highlight edges connected to the selected node.
	let visibleMapEdges = $derived(
		activationEdges
			.filter(
				(edge) => visibleNodeIds.includes(edge.source) && visibleNodeIds.includes(edge.target)
			)
			.flatMap((edge) => {
				const isConnectedToSelectedNode =
					selectedGraphNodeId !== null &&
					(edge.source === selectedGraphNodeId || edge.target === selectedGraphNodeId);
				if (!isConnectedToSelectedNode) return [edge];

				const outlineStyle =
					(typeof edge.style === 'string' ? edge.style : '')
						.replace(/stroke: [^;]+;/, 'stroke: #090d0e;')
						.replace(/stroke-width: [^;]+;/, 'stroke-width: 8;') + ' pointer-events: none;';
				const selectedStyle =
					(typeof edge.style === 'string' ? edge.style : '').replace(
						/stroke: [^;]+;/,
						'stroke: var(--accent-orange);'
					) + ' pointer-events: none;';

				return [
					{
						...edge,
						id: `${edge.id}-selection-outline`,
						selectable: false,
						interactionWidth: 0,
						style: outlineStyle
					},
					{ ...edge, selectable: false, interactionWidth: 0, style: selectedStyle }
				];
			})
	);
	let selectedTargets = $derived.by(() => {
		if (selectedPlugin) {
			return activationTargets.filter((target) => target.pluginId === selectedPlugin.id);
		}

		if (selectedOfficialPlugins.length) {
			const officialIds = selectedOfficialPlugins.map((plugin) => plugin.id);
			return activationTargets.filter((target) => officialIds.includes(target.pluginId));
		}

		if (selectedInstall) {
			return activationTargets.filter((target) => target.installId === selectedInstall.id);
		}

		return [];
	});
	let selectedPluginTargetGroups = $derived.by(() => {
		const plugin = selectedPlugin;
		if (!plugin) return [];
		return createPluginTargetGroups(plugin, activationInstalls, activationTargets);
	});

	function openTargetIssueDetails(install: HoudiniInstall, target: ActivationTarget) {
		targetIssueDetails = {
			installId: install.id,
			installLabel: install.label,
			packageFile: target.packageFile,
			target,
			summary: targetIssueSummary(target),
			messages: targetIssueMessages(target)
		};
	}

	function closeTargetIssueDetails() {
		targetIssueDetails = null;
	}

	function openTargetConfigDialog(install: HoudiniInstall, target: ActivationTarget) {
		const plugin = selectedPlugin;
		if (!plugin || !target.packagePath || isScanActive || pluginActionState === 'working') return;

		liveJsonEditorContext = { plugin, install, target };
	}

	function closeTargetConfigDialog() {
		liveJsonEditorContext = null;
	}

	function recordScanActivity(
		stage: ScanStage,
		status: ActivityEventStatus,
		pluginIds: string[] = [],
		message = ''
	) {
		const plugin =
			pluginIds.length === 1
				? activationPlugins.find((candidate) => candidate.id === pluginIds[0])
				: undefined;
		const title =
			stage === 'git'
				? plugin
					? `Git metadata sync ${status === 'success' ? 'complete' : 'failed'} for ${plugin.name}`
					: `Git metadata sync ${status === 'success' ? 'complete' : 'failed'}`
				: stage === 'plugins'
					? plugin
						? `Plugin config scan ${status === 'success' ? 'complete' : 'failed'} for ${plugin.name}`
						: `Plugin scan ${status === 'success' ? 'complete' : 'failed'}`
					: `Houdini install scan ${status === 'success' ? 'complete' : 'failed'}`;
		const detail =
			status === 'success'
				? plugin
					? plugin.name
					: stage === 'git'
						? 'Workspace Git metadata'
						: stage === 'plugins'
							? 'Workspace plugin inventory'
							: 'Detected Houdini installations'
				: message;

		recordActivity({
			kind: stage === 'git' ? 'sync' : 'scan',
			status,
			title,
			detail
		});
	}

	function applyDiscovery(response: HoudiniDiscoveryResponse, liveStage?: ScanAction) {
		setLibraryDiscoveryCache(response);
		activationPlugins = response.plugins;
		activationInstalls = response.installs;
		activationTargets = response.targets;
		hasDiscoverySnapshot = true;

		for (const { stage } of scanStages) {
			const timestamp = responseStageTimestamp(response, stage);
			if (response.source === 'saved') {
				setScanStatus(
					stage,
					timestamp ? 'ready' : 'pending',
					'',
					timestamp ? 'saved' : 'none',
					timestamp
				);
				continue;
			}

			if (liveStage === 'all' || liveStage === stage) {
				setScanStatus(
					stage,
					timestamp ? 'ready' : 'pending',
					'',
					timestamp ? 'live' : 'none',
					timestamp
				);
			} else if (!scanStatuses[stage].scannedAt && timestamp) {
				setScanStatus(stage, 'ready', '', 'live', timestamp);
			}
		}
	}

	function reconcileSelectedNode(response: HoudiniDiscoveryResponse) {
		const selectionStillExists = libraryNavigationState.selectedNodeId
			? libraryNavigationState.selectedNodeId === OFFICIAL_NODE_ID
				? response.plugins.some(isOfficialPlugin)
				: response.plugins.some(
						(plugin) => `plugin:${plugin.id}` === libraryNavigationState.selectedNodeId
					) ||
					response.installs.some((install) => install.id === libraryNavigationState.selectedNodeId)
			: false;
		if (selectionStillExists) return;

		libraryNavigationState.selectedNodeId = null;
		persistSelectedNode(null);
	}

	function restoreSelectedNode() {
		if (libraryNavigationState.selectedNodeId) return;
		try {
			libraryNavigationState.selectedNodeId = localStorage.getItem(selectedNodeStorageKey);
		} catch {
			libraryNavigationState.selectedNodeId = null;
		}
	}

	function persistSelectedNode(id: string | null) {
		try {
			if (id) {
				localStorage.setItem(selectedNodeStorageKey, id);
			} else {
				localStorage.removeItem(selectedNodeStorageKey);
			}
		} catch {
			return;
		}
	}

	function restorePinnedPluginUpdates() {
		pinnedPluginUpdates = readPinnedPluginUpdates(localStorage, pinnedPluginUpdatesStorageKey);
	}

	function setScanStatus(
		stage: ScanStage,
		state: ScanState,
		error = '',
		source = scanStatuses[stage].source,
		scannedAt = scanStatuses[stage].scannedAt
	) {
		scanStatuses[stage] = { state, error, source, scannedAt };
	}

	function getErrorMessage(error: unknown) {
		return error instanceof Error ? error.message : String(error);
	}

	function recordActivity(event: Omit<ActivityEvent, 'id' | 'timestamp'>) {
		const timestamp = new Date().toISOString();
		activityEvents = [
			{
				...event,
				id: `${timestamp}-${activitySequence++}`,
				timestamp
			},
			...activityEvents
		];
		persistActivityEvents();
	}

	function restoreActivityEvents() {
		try {
			activityEvents = readActivityEvents(localStorage, getActivityHistoryRetention());
		} catch {
			activityEvents = [];
		}
	}

	function persistActivityEvents() {
		try {
			activityEvents = writeActivityEvents(
				localStorage,
				activityEvents,
				getActivityHistoryRetention()
			);
		} catch {
			return;
		}
	}

	function selectNode(id: string | null) {
		installDialogOpen = false;
		libraryNavigationState.selectedNodeId = id;
		persistSelectedNode(id);
		installState = 'idle';
		installMessage = '';
		gitSyncState = 'idle';
		gitSyncMessage = '';
		pluginScanState = 'idle';
		pluginActionState = 'idle';
	}

	function toggleConnectionFilter() {
		if (!selectedGraphNodeId) {
			libraryNavigationState.connectionFilterNodeId = null;
			return;
		}
		libraryNavigationState.connectionFilterNodeId =
			libraryNavigationState.connectionFilterNodeId === selectedGraphNodeId
				? null
				: selectedGraphNodeId;
	}

	function openIssuesDialog(target?: ActivationTarget) {
		if (issueItems.length) issuesDialogOpen = true;
		issueCheckerFilterId = target ? issueFilterId(issueFilterForTarget(target)) : 'all';
	}

	function closeIssuesDialog() {
		issuesDialogOpen = false;
		issueCheckerFilterId = 'all';
	}

	function openUpdatesDialog() {
		if (pluginUpdateItems.length) updatesDialogOpen = true;
	}

	function closeUpdatesDialog() {
		updatesDialogOpen = false;
	}

	function keepCurrentPluginVersion(update: PluginUpdateItem) {
		pinnedPluginUpdates = pinPluginUpdate(pinnedPluginUpdates, update);
		writePinnedPluginUpdates(localStorage, pinnedPluginUpdatesStorageKey, pinnedPluginUpdates);
		recordActivity({
			kind: 'plugin',
			status: 'success',
			title: 'Plugin update pinned',
			detail: `${update.pluginName} ${update.currentVersion} pinned for ${update.installLabel}; latest available is ${update.latestVersion}`
		});
	}

	function unpinPluginVersion(update: PluginUpdateItem) {
		pinnedPluginUpdates = unpinPluginUpdate(pinnedPluginUpdates, update);
		writePinnedPluginUpdates(localStorage, pinnedPluginUpdatesStorageKey, pinnedPluginUpdates);
		recordActivity({
			kind: 'plugin',
			status: 'success',
			title: 'Plugin update unpinned',
			detail: `${update.pluginName} on ${update.installLabel} can receive updates again`
		});
	}

	function selectPluginUpdate(update: PluginUpdateItem) {
		closeUpdatesDialog();
		libraryNavigationState.view = 'map';
		selectNode(`plugin:${update.pluginId}`);
	}

	function selectIssue(issue: IssueItem, target: ActivationTarget) {
		libraryNavigationState.view = 'map';
		libraryNavigationState.searchQuery = '';
		closeIssuesDialog();
		libraryNavigationState.focusNodeId = issue.nodeId;
		selectNode(issue.nodeId);
		const install = activationInstalls.find((item) => item.id === target.installId);
		if (install) openTargetIssueDetails(install, target);
	}

	function handleIssueFilterChange(filterId: string) {
		issueCheckerFilterId = filterId;
	}

	function handleGroupIssueBuildsChange(value: boolean) {
		groupIssueBuilds = value;
	}

	function handleLiveJsonDiscovery(response: HoudiniDiscoveryResponse) {
		const pluginName = liveJsonEditorContext?.plugin.name ?? 'Plugin';
		const installLabel = liveJsonEditorContext?.install.label ?? 'Houdini install';
		applyDiscovery(response, 'plugins');
		recordActivity({
			kind: 'config',
			status: 'success',
			title: `Updated ${pluginName} config`,
			detail: installLabel
		});
	}

	function handleOpenTargetConfig(installId: string) {
		void runSelectedPluginAction({ action: 'open-config', installId });
	}

	function handleOpenTargetEditor(installId: string, target: ActivationTarget) {
		const install = activationInstalls.find((candidate) => candidate.id === installId);
		if (install) openTargetConfigDialog(install, target);
	}

	function openInstallDialog() {
		const plugin = selectedPlugin;
		if (
			!plugin ||
			!plugin.repositoryUrl ||
			!selectedPluginVersions.length ||
			!activationInstalls.length
		) {
			return;
		}

		installState = 'idle';
		installMessage = '';
		installDialogOpen = true;
	}

	async function openInstallPath(path: string) {
		try {
			await runHoudiniPluginAction({
				action: 'open-path',
				installId: selectedInstall?.id ?? '',
				path
			});
		} catch {
			// The path action is best effort; the selected install remains unchanged.
		}
	}

	function closeInstallDialog() {
		if (installState === 'working') return;
		installDialogOpen = false;
	}

	function openPluginMigrator() {
		if (isScanActive || !activationInstalls.length || !activationPlugins.length) return;
		migrationState = 'idle';
		migrationMessage = '';
		pluginMigratorOpen = true;
	}

	function closePluginMigrator() {
		if (migrationState === 'working') return;
		pluginMigratorOpen = false;
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		if (pluginMigratorOpen && migrationState !== 'working') {
			closePluginMigrator();
			return;
		}
		if (issuesDialogOpen) closeIssuesDialog();
		if (updatesDialogOpen) closeUpdatesDialog();
		if (targetIssueDetails) closeTargetIssueDetails();
		if (liveJsonEditorContext) closeTargetConfigDialog();
		if (installDialogOpen && installState !== 'working') closeInstallDialog();
	}

	async function migratePlugins(request: HoudiniPluginMigrationRequest) {
		if (migrationState === 'working') return;

		migrationState = 'working';
		migrationMessage = '';
		const destination = activationInstalls.find(
			(install) => install.id === request.destinationInstallId
		);
		try {
			const result = await runHoudiniPluginAction(request);
			if (result.discovery) applyDiscovery(result.discovery, 'plugins');
			migrationState = 'success';
			migrationMessage = result.message;
			recordActivity({
				kind: 'migration',
				status: 'success',
				title: 'Plugin config migration complete',
				detail: `${request.sources.length} plugin${request.sources.length === 1 ? '' : 's'} to ${destination?.label ?? 'selected install'}`
			});
		} catch (error) {
			migrationState = 'error';
			migrationMessage = getErrorMessage(error);
			recordActivity({
				kind: 'migration',
				status: 'error',
				title: 'Plugin config migration failed',
				detail: migrationMessage
			});
		}
	}

	async function rescanSelectedPluginConfigs() {
		const plugin = selectedPlugin;
		if (!plugin || isScanActive) return;
		pluginScanState = 'working';
		const refreshed = await runStage('plugins', [plugin.id]);
		if (selectedPlugin?.id !== plugin.id) return;
		if (refreshed) {
			pluginScanState = 'success';
		} else {
			pluginScanState = 'error';
		}
	}

	async function rescanSelectedInstall() {
		if (!selectedInstall || isScanActive) return false;
		return await runStage('installs');
	}

	async function runSelectedPluginAction(request: PluginDetailAction) {
		const plugin = selectedPlugin;
		if (!plugin || isScanActive || pluginActionState === 'working') return;

		pluginActionState = 'working';
		const targetInstall =
			request.action === 'set-enabled'
				? activationInstalls.find((install) => install.id === request.installId)
				: undefined;
		try {
			const result = await runHoudiniPluginAction({ pluginId: plugin.id, ...request });
			if (result.discovery) applyDiscovery(result.discovery, 'plugins');
			pluginActionState = 'success';
			if (request.action === 'set-enabled') {
				recordActivity({
					kind: 'plugin',
					status: 'success',
					title: `${request.enabled ? 'Enabled' : 'Disabled'} ${plugin.name}`,
					detail: targetInstall?.label ?? 'Selected Houdini install'
				});
			}
		} catch (error) {
			pluginActionState = 'error';
			if (request.action === 'set-enabled') {
				recordActivity({
					kind: 'plugin',
					status: 'error',
					title: `${request.enabled ? 'Enable' : 'Disable'} ${plugin.name} failed`,
					detail: getErrorMessage(error)
				});
			}
		}
	}

	async function installSelectedPlugin(
		selection: InstallDialogSelection,
		options: InstallDialogOptions
	) {
		if (
			!selectedPlugin ||
			!installPlugin ||
			!selectedPluginVersions.includes(selection.version) ||
			!selection.installIds.length ||
			!selection.destinationPath
		) {
			return;
		}
		const plugin = installPlugin;
		const request: InstallDialogRequest = {
			pluginId: selectedPlugin.id,
			version: selection.version,
			installIds: selection.installIds,
			destinationPath: selection.destinationPath
		};

		installState = 'working';
		installMessage = '';
		const destinationLabels = request.installIds.map(
			(installId) =>
				activationInstalls.find((install) => install.id === installId)?.label ?? installId
		);
		const controller = new AbortController();
		installController = controller;
		try {
			const result = await installHoudiniPlugin(request, controller.signal);
			applyDiscovery(result.discovery, 'all');
			installState = 'success';
			const postInstallMessages = [result.message];
			installDialogOpen = false;
			if (options.openInstalledFolder) {
				try {
					await runHoudiniPluginAction({
						pluginId: plugin.id,
						action: 'open-source',
						sourcePath: request.destinationPath
					});
				} catch (error) {
					postInstallMessages.push(getErrorMessage(error));
				}
			}
			if (options.openInstalledConfig) {
				try {
					await runHoudiniPluginAction({
						pluginId: plugin.id,
						action: 'open-config',
						installId: request.installIds[0]
					});
				} catch (error) {
					postInstallMessages.push(getErrorMessage(error));
				}
			}
			installMessage = postInstallMessages.join(' ');
			recordActivity({
				kind: 'install',
				status: 'success',
				title: `Installed ${plugin.name}`,
				detail: `${request.version} · ${destinationLabels.join(', ')}`
			});
		} catch (error) {
			if (
				controller.signal.aborted ||
				(error instanceof DOMException && error.name === 'AbortError')
			) {
				installState = 'idle';
				installMessage = 'Installation cancelled.';
				recordActivity({
					kind: 'install',
					status: 'cancelled',
					title: `Installation cancelled for ${plugin.name}`,
					detail: `${request.version} · ${destinationLabels.join(', ')}`
				});
			} else {
				installState = 'error';
				installMessage = getErrorMessage(error);
				recordActivity({
					kind: 'install',
					status: 'error',
					title: `Installation failed for ${plugin.name}`,
					detail: installMessage
				});
			}
		} finally {
			if (installController === controller) installController = null;
		}
	}

	function cancelInstall() {
		installController?.abort();
	}

	async function syncSelectedPluginGit() {
		const plugin = selectedPlugin;
		if (!plugin?.repositoryUrl || isScanActive) return;

		gitSyncState = 'working';
		gitSyncMessage = '';
		const synced = await runStage('git', [plugin.id]);
		if (selectedPlugin?.id !== plugin.id) return;

		if (synced) {
			gitSyncState = 'success';
			gitSyncMessage = 'Git metadata synced';
		} else {
			gitSyncState = 'error';
			gitSyncMessage = scanStatuses.git.error || 'Git metadata sync failed';
		}
	}

	async function loadInitialDiscovery() {
		const cachedDiscovery = readLibraryDiscoveryCache();
		if (cachedDiscovery) {
			snapshotLoadState = 'ready';
			applyDiscovery(cachedDiscovery);
			reconcileSelectedNode(cachedDiscovery);
			return;
		}

		snapshotLoadState = 'loading';
		try {
			const snapshot = await fetchHoudiniDiscoverySnapshot();
			snapshotLoadState = 'ready';
			if (snapshot) {
				applyDiscovery(snapshot);
				reconcileSelectedNode(snapshot);
				recordActivity({
					kind: 'scan',
					status: 'success',
					title: 'Discovery snapshot restored',
					detail: 'Saved workspace snapshot'
				});
				return;
			}
		} catch {
			snapshotLoadState = 'error';
		}

		await runInitialScan();
	}

	const scanOrchestrator = createScanOrchestrator({
		stages: scanStages.map(({ stage }) => stage),
		getActiveScan: () => activeScan,
		setActiveScan: (scan) => (activeScan = scan),
		getInitialScanStarted: () => initialScanStarted,
		setInitialScanStarted: (started) => (initialScanStarted = started),
		getScanStatus: (stage) => scanStatuses[stage],
		setScanStatus,
		applyDiscovery,
		reconcileSelectedNode,
		recordScanActivity,
		getErrorMessage
	});

	const runStage = scanOrchestrator.runStage;
	const cancelScan = scanOrchestrator.cancelScan;
	const runInitialScan = scanOrchestrator.runInitialScan;
	const runGlobalScan = scanOrchestrator.runGlobalScan;

	onMount(() => {
		initializeActivitySettings();
		restoreSelectedNode();
		restorePinnedPluginUpdates();
		restoreActivityEvents();
		void loadInitialDiscovery();
	});
</script>

<svelte:head>
	<title>HPM / Activation Map</title>
	<meta
		name="description"
		content="See which Houdini plugins are active across every detected install."
	/>
</svelte:head>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="page-shell px-3.5 pb-4 sm:px-6 lg:px-10">
	<Tooltip />
	<AppHeader activeSection="library" />

	<main class="page-main mx-auto">
		<ActivationWorkspace
			view={libraryNavigationState.view}
			searchQuery={libraryNavigationState.searchQuery}
			selectedNodeId={libraryNavigationState.selectedNodeId}
			{selectedGraphNodeId}
			connectionFilterNodeId={libraryNavigationState.connectionFilterNodeId}
			focusNodeId={libraryNavigationState.focusNodeId}
			{isScanActive}
			{scanStages}
			{scanStatuses}
			{scanError}
			{discoveryState}
			{snapshotLoadState}
			{hasDiscoverySnapshot}
			{activationPlugins}
			{activationInstalls}
			{activationTargets}
			{filteredPlugins}
			{visibleMapNodes}
			{visibleMapEdges}
			{selectedPlugin}
			{selectedOfficialPlugins}
			{selectedInstall}
			{selectedTargets}
			{selectedPluginTargetGroups}
			selectedPluginGitSource={selectedPlugin?.sources?.find(
				(source) => source.exists && source.versionSource === 'git'
			)}
			{selectedPluginVersions}
			{selectedPluginUpdates}
			{pluginCount}
			{enabledCount}
			{attentionCount}
			{updateCount}
			{issueItems}
			{issuesDialogOpen}
			{updatesDialogOpen}
			{pluginMigratorOpen}
			{filterButtonIsActive}
			{pluginScanState}
			{pluginActionState}
			{gitSyncState}
			{gitSyncMessage}
			{installState}
			{installMessage}
			onGlobalScan={() => void runGlobalScan()}
			onCancelScan={cancelScan}
			onScanStage={(stage) => void runStage(stage)}
			onInitialScan={() => void runInitialScan()}
			onRunPluginMigrator={openPluginMigrator}
			onOpenIssues={() => openIssuesDialog()}
			onOpenUpdates={openUpdatesDialog}
			onToggleConnectionFilter={toggleConnectionFilter}
			onClearSearch={() => (libraryNavigationState.searchQuery = '')}
			onSearchQueryChange={(value) => (libraryNavigationState.searchQuery = value)}
			onSelectNode={selectNode}
			onFocusComplete={() => (libraryNavigationState.focusNodeId = null)}
			onViewChange={(nextView) => (libraryNavigationState.view = nextView)}
			onRescanPluginConfigs={() => void rescanSelectedPluginConfigs()}
			onRescanInstall={() => rescanSelectedInstall()}
			onSyncGit={() => void syncSelectedPluginGit()}
			onPluginAction={(request) => void runSelectedPluginAction(request)}
			onOpenTargetConfig={openTargetConfigDialog}
			onOpenTargetIssueDetails={openTargetIssueDetails}
			onOpenInstallDialog={openInstallDialog}
			onOpenInstallPath={openInstallPath}
			onSelectPlugin={(pluginId) => selectNode(`plugin:${pluginId}`)}
			onHconfigEvent={(event) => {
				const installLabel = selectedInstall?.label ?? 'Houdini install';
				recordActivity({
					kind: 'hconfig',
					status: event.status,
					title:
						event.status === 'success'
							? `Hconfig execution complete for ${installLabel}`
							: event.status === 'cancelled'
								? `Hconfig execution cancelled for ${installLabel}`
								: `Hconfig execution failed for ${installLabel}`,
					detail: event.detail
				});
			}}
		/>
		<ActivityConsole events={activityEvents} />
	</main>
	<ActivationDialogs
		{installDialogOpen}
		{installPlugin}
		{installVersionOptions}
		{activationInstalls}
		{activationTargets}
		remoteSourceOptions={installRemoteSourceOptions}
		hpmPluginDestination={installHpmPluginDestination}
		{installState}
		{installMessage}
		{pluginMigratorOpen}
		{activationPlugins}
		{migrationState}
		{migrationMessage}
		{issuesDialogOpen}
		{updatesDialogOpen}
		{issueItems}
		{pluginUpdateItems}
		{pinnedPluginUpdateItems}
		{issueConfigOptions}
		{issueCheckerFilterId}
		{groupIssueBuilds}
		{liveJsonEditorContext}
		{isScanActive}
		{targetIssueDetails}
		{pluginActionState}
		onCloseInstall={closeInstallDialog}
		onCancelInstall={cancelInstall}
		onInstall={(request, options) => void installSelectedPlugin(request, options)}
		onClosePluginMigrator={closePluginMigrator}
		onMigrate={(request) => void migratePlugins(request)}
		onCloseIssues={closeIssuesDialog}
		onCloseUpdates={closeUpdatesDialog}
		onKeepCurrentUpdate={keepCurrentPluginVersion}
		onUnpinUpdate={unpinPluginVersion}
		onSelectUpdate={selectPluginUpdate}
		onFilterChange={handleIssueFilterChange}
		onGroupBuildsChange={handleGroupIssueBuildsChange}
		onSelectIssue={selectIssue}
		onCloseLiveJsonEditor={closeTargetConfigDialog}
		onLiveJsonDiscovery={handleLiveJsonDiscovery}
		onCloseTargetIssue={closeTargetIssueDetails}
		onOpenTargetConfig={handleOpenTargetConfig}
		onOpenTargetEditor={handleOpenTargetEditor}
	/>
</div>

<style>
	.page-shell {
		display: flex;
		height: 100dvh;
		min-height: 0;
		flex-direction: column;
		overflow: hidden;
	}

	.page-main {
		display: flex;
		min-height: 0;
		flex: 1;
		width: 100%;
		flex-direction: column;
	}

	:global {
		nav a {
			padding: 8px 0;
			color: var(--text-dim);
			font-size: 12px;
			text-decoration: none;
		}

		nav a:hover,
		nav a.active {
			color: var(--text);
		}

		nav a.active {
			border-bottom: 2px solid #e46e58;
		}

		.topbar-status {
			display: flex;
			align-items: center;
			gap: 8px;
			color: var(--text-muted);
			font-family: 'Cascadia Code', 'Courier New', monospace;
			font-size: 12px;
			letter-spacing: 0.04em;
			text-transform: uppercase;
		}

		.topbar-status span {
			width: 7px;
			height: 7px;
			border-radius: 50%;
			background: #399b82;
			box-shadow: 0 0 0 4px rgba(57, 155, 130, 0.12);
		}

		.topbar-status span.status-error {
			background: #df6d58;
			box-shadow: 0 0 0 4px rgba(223, 109, 88, 0.12);
		}
	}
</style>
