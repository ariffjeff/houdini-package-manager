<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
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
		scanStageLabels,
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
		InstallVersionOption
	} from '$lib/plugin-install/types';
	import logo from '$lib/assets/hpm.svg';
	import {
		fetchHoudiniDiscoverySnapshot,
		installHoudiniPlugin,
		runHoudiniPluginAction
	} from '$lib/houdini/client';
	import Tooltip from '$lib/Tooltip.svelte';

	type ViewMode = 'map' | 'table';
	type LiveJsonEditorContext = {
		plugin: PluginRecord;
		install: HoudiniInstall;
		target: ActivationTarget;
	};

	const selectedNodeStorageKey = 'hpm:last-selected-node';

	let view = $state<ViewMode>('map');
	let searchQuery = $state('');
	let selectedNodeId = $state<string | null>(null);
	let connectionFilterNodeId = $state<string | null>(null);
	let focusNodeId = $state<string | null>(null);
	let activeScan = $state<ScanAction | null>(null);
	let initialScanStarted = false;
	let hasDiscoverySnapshot = $state(false);
	let snapshotLoadState = $state<ScanState>('pending');
	let scanStatuses = $state<Record<ScanStage, ScanStatus>>({
		installs: { state: 'pending', error: '', source: 'none', scannedAt: null },
		plugins: { state: 'pending', error: '', source: 'none', scannedAt: null },
		git: { state: 'pending', error: '', source: 'none', scannedAt: null }
	});
	let activationPlugins = $state<PluginRecord[]>([]);
	let activationInstalls = $state<HoudiniInstall[]>([]);
	let activationTargets = $state<ActivationTarget[]>([]);
	let installDialogOpen = $state(false);
	let installState = $state<'idle' | 'working' | 'success' | 'error'>('idle');
	let installMessage = $state('');
	let installController: AbortController | null = null;
	let pluginMigratorOpen = $state(false);
	let settingsDialogOpen = $state(false);
	let migrationState = $state<'idle' | 'working' | 'success' | 'error'>('idle');
	let migrationMessage = $state('');
	let gitSyncState = $state<PluginDetailActionState>('idle');
	let gitSyncMessage = $state('');
	let pluginScanState = $state<PluginDetailActionState>('idle');
	let pluginActionState = $state<PluginDetailActionState>('idle');
	let issuesDialogOpen = $state(false);
	let issueCheckerFilterId = $state('all');
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
	let activeScanLabel = $derived(
		snapshotLoadState === 'loading' && !hasDiscoverySnapshot
			? 'Loading saved snapshot'
			: activeScan === 'all'
				? 'Scanning workspace'
				: activeScan
					? `Scanning ${scanStageLabels[activeScan]}`
					: ''
	);
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
	let issueConfigOptions = $derived(
		createIssueConfigOptions(activationTargets, activationInstalls)
	);
	let normalizedQuery = $derived(searchQuery.trim().toLowerCase());
	let selectedGraphNodeId = $derived.by(() => {
		if (!selectedNodeId) return null;
		if (activationNodes.some((node) => node.id === selectedNodeId)) return selectedNodeId;

		if (selectedNodeId.startsWith('plugin:')) {
			const pluginId = selectedNodeId.slice('plugin:'.length);
			const plugin = activationPlugins.find((item) => item.id === pluginId);
			if (plugin && isOfficialPlugin(plugin)) return OFFICIAL_NODE_ID;
		}

		return selectedNodeId;
	});
	let filterButtonIsActive = $derived(
		connectionFilterNodeId !== null &&
			(selectedGraphNodeId === null || connectionFilterNodeId === selectedGraphNodeId)
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
		selectedPlugin ? availablePluginUpdates(selectedPlugin) : []
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
		if (connectionFilterNodeId) {
			const connectedNodeIds = new SvelteSet([connectionFilterNodeId]);
			for (const edge of activationEdges) {
				if (edge.source === connectionFilterNodeId || edge.target === connectionFilterNodeId) {
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
		const selectionStillExists = selectedNodeId
			? selectedNodeId === OFFICIAL_NODE_ID
				? response.plugins.some(isOfficialPlugin)
				: response.plugins.some((plugin) => `plugin:${plugin.id}` === selectedNodeId) ||
					response.installs.some((install) => install.id === selectedNodeId)
			: false;
		if (selectionStillExists) return;

		selectedNodeId = null;
		persistSelectedNode(null);
	}

	function restoreSelectedNode() {
		try {
			selectedNodeId = localStorage.getItem(selectedNodeStorageKey);
		} catch {
			selectedNodeId = null;
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
		selectedNodeId = id;
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
			connectionFilterNodeId = null;
			return;
		}
		connectionFilterNodeId =
			connectionFilterNodeId === selectedGraphNodeId ? null : selectedGraphNodeId;
	}

	function openIssuesDialog(target?: ActivationTarget) {
		if (issueItems.length) issuesDialogOpen = true;
		issueCheckerFilterId = target ? issueFilterId(issueFilterForTarget(target)) : 'all';
	}

	function closeIssuesDialog() {
		issuesDialogOpen = false;
		issueCheckerFilterId = 'all';
	}

	function selectIssue(issue: IssueItem, target: ActivationTarget) {
		view = 'map';
		searchQuery = '';
		closeIssuesDialog();
		focusNodeId = issue.nodeId;
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

	function openSettingsDialog() {
		settingsDialogOpen = true;
	}

	function closeSettingsDialog() {
		settingsDialogOpen = false;
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		if (settingsDialogOpen) {
			closeSettingsDialog();
			return;
		}
		if (pluginMigratorOpen && migrationState !== 'working') {
			closePluginMigrator();
			return;
		}
		if (issuesDialogOpen) closeIssuesDialog();
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
		request: InstallDialogRequest,
		options: InstallDialogOptions
	) {
		const plugin = selectedPlugin;
		if (
			!plugin ||
			request.pluginId !== plugin.id ||
			!selectedPluginVersions.includes(request.version) ||
			!request.installIds.length ||
			!request.destinationPath
		) {
			return;
		}

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
		setScanStatus,
		applyDiscovery,
		reconcileSelectedNode,
		recordScanActivity,
		getErrorMessage
	});

	const runStage = scanOrchestrator.runStage;
	const runInitialScan = scanOrchestrator.runInitialScan;
	const runGlobalScan = scanOrchestrator.runGlobalScan;

	onMount(() => {
		initializeActivitySettings();
		restoreSelectedNode();
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
	<header
		class="mx-auto flex flex-wrap items-center gap-4.5 border-white/10 py-4.5 lg:flex-nowrap lg:gap-10 lg:py-5.5"
	>
		<a class="flex items-center" href={resolve('/')} aria-label="HPM home">
			<img class="h-7.5 w-auto" src={logo} alt="HPM logo" />
		</a>
		<nav
			class="order-3 flex w-full items-center justify-between gap-2 overflow-x-auto lg:order-0 lg:mr-auto lg:w-auto lg:justify-start lg:gap-6.5"
			aria-label="Primary navigation"
		>
			<a class="active" href="#library">Library</a>
			<a href="#discover">Discover</a>
			<a href="#installs">Houdini installs</a>
			<a href="#activity">Activity</a>
			<a
				href={resolve('/settings')}
				aria-haspopup="dialog"
				aria-expanded={settingsDialogOpen}
				onclick={(event) => {
					event.preventDefault();
					openSettingsDialog();
				}}>Settings</a
			>
		</nav>
		<div class="topbar-status ml-auto lg:ml-0">
			<span class:status-error={Boolean(scanError)}></span>
			{#if isScanActive}
				{activeScanLabel}
			{:else if scanError}
				Scan needs attention
			{:else}
				{activationInstalls.length} installs scanned
			{/if}
		</div>
	</header>

	<main class="page-main mx-auto">
		<ActivationWorkspace
			{view}
			{searchQuery}
			{selectedNodeId}
			{selectedGraphNodeId}
			{connectionFilterNodeId}
			{focusNodeId}
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
			{issueItems}
			{issuesDialogOpen}
			{pluginMigratorOpen}
			{filterButtonIsActive}
			{pluginScanState}
			{pluginActionState}
			{gitSyncState}
			{gitSyncMessage}
			{installState}
			{installMessage}
			onGlobalScan={() => void runGlobalScan()}
			onScanStage={(stage) => void runStage(stage)}
			onInitialScan={() => void runInitialScan()}
			onRunPluginMigrator={openPluginMigrator}
			onOpenIssues={() => openIssuesDialog()}
			onToggleConnectionFilter={toggleConnectionFilter}
			onClearSearch={() => (searchQuery = '')}
			onSearchQueryChange={(value) => (searchQuery = value)}
			onSelectNode={selectNode}
			onFocusComplete={() => (focusNodeId = null)}
			onViewChange={(nextView) => (view = nextView)}
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
		{settingsDialogOpen}
		{installDialogOpen}
		{selectedPlugin}
		{selectedPluginVersionOptions}
		{activationInstalls}
		{activationTargets}
		{remoteSourceOptions}
		{hpmPluginDestination}
		{installState}
		{installMessage}
		{pluginMigratorOpen}
		{activationPlugins}
		{migrationState}
		{migrationMessage}
		{issuesDialogOpen}
		{issueItems}
		{issueConfigOptions}
		{issueCheckerFilterId}
		{groupIssueBuilds}
		{liveJsonEditorContext}
		{isScanActive}
		{targetIssueDetails}
		{pluginActionState}
		onCloseSettings={closeSettingsDialog}
		onActivitySettingsSaved={restoreActivityEvents}
		onCloseInstall={closeInstallDialog}
		onCancelInstall={cancelInstall}
		onInstall={(request, options) => void installSelectedPlugin(request, options)}
		onClosePluginMigrator={closePluginMigrator}
		onMigrate={(request) => void migratePlugins(request)}
		onCloseIssues={closeIssuesDialog}
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

		@media (max-width: 760px) {
			nav a {
				white-space: nowrap;
			}
		}
	}
</style>
