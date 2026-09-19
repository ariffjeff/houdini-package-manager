<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import ActivationMap from '$lib/activation-map/ActivationMap.svelte';
	import ActivationTable from '$lib/activation-map/ActivationTable.svelte';
	import IssueChecker from '$lib/activation-map/IssueChecker.svelte';
	import PluginDetailPanel from '$lib/activation-map/PluginDetailPanel.svelte';
	import TargetIssueDialog from '$lib/activation-map/TargetIssueDialog.svelte';
	import type { TargetIssueDetails } from '$lib/activation-map/target-issue-dialog';
	import LiveJsonEditor from '$lib/live-json-editor/LiveJsonEditor.svelte';
	import PluginInstallDialog from '$lib/plugin-install/PluginInstallDialog.svelte';
	import {
		createActivationGraph,
		isOfficialPlugin,
		OFFICIAL_NODE_ID
	} from '$lib/activation-map/model';
	import {
		createPluginTargetGroups,
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
		HoudiniDiscoveryDiagnostic,
		HoudiniInstall,
		PluginRecord
	} from '$lib/activation-map/types';
	import { targetIssueMessages, targetIssueSummary } from '$lib/houdini/known-issues';
	import type { HoudiniDiscoveryResponse } from '$lib/houdini/types';
	import type { InstallDialogOptions, InstallDialogRequest } from '$lib/plugin-install/types';
	import logo from '$lib/assets/hpm.svg';
	import {
		fetchHoudiniDiscoverySnapshot,
		installHoudiniPlugin,
		runHoudiniPluginAction,
		scanHoudiniWorkspace
	} from '$lib/houdini/client';
	import { Play, CloudDownload, Search } from '@lucide/svelte';

	type ViewMode = 'map' | 'table';
	type ScanStage = 'installs' | 'plugins' | 'git';
	type ScanState = 'pending' | 'loading' | 'ready' | 'error';
	type ScanSource = 'none' | 'saved' | 'live';
	type ScanStatus = {
		state: ScanState;
		error: string;
		source: ScanSource;
		scannedAt: string | null;
	};
	type ScanAction = ScanStage | 'all';
	type TooltipState = {
		text: string;
		left: number;
		top: number;
		placement: 'above' | 'below';
	};
	type LiveJsonEditorContext = {
		plugin: PluginRecord;
		install: HoudiniInstall;
		target: ActivationTarget;
	};

	const scanStages: Array<{ stage: ScanStage; label: string }> = [
		{ stage: 'installs', label: 'Houdini Installs' },
		{ stage: 'plugins', label: 'Plugins' },
		{ stage: 'git', label: 'Git Metadata' }
	];
	const scanStageLabels: Record<ScanStage, string> = {
		installs: 'Houdini Installs',
		plugins: 'Plugins',
		git: 'Git Metadata'
	};
	const selectedNodeStorageKey = 'hpm:last-selected-node';

	let view = $state<ViewMode>('map');
	let searchQuery = $state('');
	let selectedNodeId = $state<string | null>(null);
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
	let scannedAt = $state<string | null>(null);
	let persistedAt = $state<string | null>(null);
	let discoverySource = $state<'none' | 'saved' | 'live'>('none');
	let discoveryDiagnostics = $state<HoudiniDiscoveryDiagnostic[]>([]);
	let activationPlugins = $state<PluginRecord[]>([]);
	let activationInstalls = $state<HoudiniInstall[]>([]);
	let activationTargets = $state<ActivationTarget[]>([]);
	let installDialogOpen = $state(false);
	let installState = $state<'idle' | 'working' | 'success' | 'error'>('idle');
	let installMessage = $state('');
	let installController: AbortController | null = null;
	let gitSyncState = $state<PluginDetailActionState>('idle');
	let gitSyncMessage = $state('');
	let pluginScanState = $state<PluginDetailActionState>('idle');
	let pluginActionState = $state<PluginDetailActionState>('idle');
	let issuesDialogOpen = $state(false);
	let issueCheckerFilterId = $state('all');
	let groupIssueBuilds = $state(false);
	let targetIssueDetails = $state<TargetIssueDetails | null>(null);
	let liveJsonEditorContext = $state<LiveJsonEditorContext | null>(null);
	let tooltip = $state<TooltipState | null>(null);

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
	let mapNodes = $derived(
		activationNodes.map((node) => ({ ...node, selected: node.id === selectedGraphNodeId }))
	);
	let visibleMapNodes = $derived.by(() => {
		if (!normalizedQuery) return mapNodes;

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

		return mapNodes.filter((node) => matchingIds.includes(node.id));
	});
	let visibleNodeIds = $derived(visibleMapNodes.map((node) => node.id));
	let visibleMapEdges = $derived(
		activationEdges.filter(
			(edge) => visibleNodeIds.includes(edge.source) && visibleNodeIds.includes(edge.target)
		)
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

	function scanStateLabel(stage: ScanStage) {
		const status = scanStatuses[stage];
		if (status.state === 'loading') return stage === 'git' ? 'Syncing' : 'Scanning';
		if (status.state === 'error') return 'Error';
		if (status.source === 'saved') return 'Saved';
		if (status.state === 'ready') return 'Ready';
		return 'Not scanned';
	}

	function formatScanTime(timestamp: string | null) {
		return timestamp ? new Date(timestamp).toLocaleString() : '';
	}

	function responseStageTimestamp(response: HoudiniDiscoveryResponse, stage: ScanStage) {
		return (
			response.stageScannedAt?.[stage] ??
			(stage === 'installs' ? response.scannedAt : stage === 'git' ? response.gitSyncedAt : null)
		);
	}

	function applyDiscovery(response: HoudiniDiscoveryResponse, liveStage?: ScanAction) {
		activationPlugins = response.plugins;
		activationInstalls = response.installs;
		activationTargets = response.targets;
		discoveryDiagnostics = response.diagnostics;
		scannedAt = response.scannedAt;
		persistedAt = response.persistedAt ?? null;
		discoverySource = response.source ?? 'live';
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

	function selectDefaultNode(response: HoudiniDiscoveryResponse) {
		const selectionStillExists = selectedNodeId
			? selectedNodeId === OFFICIAL_NODE_ID
				? response.plugins.some(isOfficialPlugin)
				: response.plugins.some((plugin) => `plugin:${plugin.id}` === selectedNodeId) ||
					response.installs.some((install) => install.id === selectedNodeId)
			: false;
		if (selectionStillExists) return;

		const firstUserPlugin = response.plugins.find((plugin) => !isOfficialPlugin(plugin));
		const firstPlugin = firstUserPlugin ?? response.plugins[0];
		selectedNodeId = firstPlugin ? `plugin:${firstPlugin.id}` : (response.installs[0]?.id ?? null);
		persistSelectedNode(selectedNodeId);
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

	function closeInstallDialog() {
		if (installState === 'working') return;
		installDialogOpen = false;
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		if (issuesDialogOpen) closeIssuesDialog();
		if (targetIssueDetails) closeTargetIssueDetails();
		if (liveJsonEditorContext) closeTargetConfigDialog();
		if (installDialogOpen && installState !== 'working') closeInstallDialog();
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

	async function runSelectedPluginAction(request: PluginDetailAction) {
		const plugin = selectedPlugin;
		if (!plugin || isScanActive || pluginActionState === 'working') return;

		pluginActionState = 'working';
		try {
			const result = await runHoudiniPluginAction({ pluginId: plugin.id, ...request });
			if (result.discovery) applyDiscovery(result.discovery, 'plugins');
			pluginActionState = 'success';
		} catch {
			pluginActionState = 'error';
		}
	}

	function tooltipTarget(target: EventTarget | null) {
		return target instanceof Element ? target.closest<HTMLElement>('[data-tooltip]') : null;
	}

	function showTooltip(target: EventTarget | null) {
		const element = tooltipTarget(target);
		if (!element) return;

		const text = element.dataset.tooltip;
		if (!text) return;

		const rect = element.getBoundingClientRect();
		const placement = rect.bottom + 44 <= window.innerHeight ? 'below' : 'above';
		tooltip = {
			text,
			left: rect.left + rect.width / 2,
			top: placement === 'below' ? rect.bottom + 8 : rect.top - 8,
			placement
		};
	}

	function hideTooltip(event: MouseEvent | FocusEvent) {
		if (tooltipTarget(event.relatedTarget)) return;
		tooltip = null;
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
		} catch (error) {
			if (
				controller.signal.aborted ||
				(error instanceof DOMException && error.name === 'AbortError')
			) {
				installState = 'idle';
				installMessage = 'Installation cancelled.';
			} else {
				installState = 'error';
				installMessage = getErrorMessage(error);
			}
		} finally {
			if (installController === controller) installController = null;
		}
	}

	function cancelInstall() {
		installController?.abort();
	}

	async function performScanStage(stage: ScanStage, pluginIds: string[] = []) {
		setScanStatus(stage, 'loading');
		const response = await scanHoudiniWorkspace({
			stage,
			...(pluginIds.length ? { pluginIds: [...pluginIds] } : {})
		});
		applyDiscovery(response, stage);
		setScanStatus(stage, 'ready');
		return response;
	}

	async function runStage(stage: ScanStage, pluginIds: string[] = []): Promise<boolean> {
		if (activeScan !== null) return false;

		activeScan = stage;
		try {
			const response = await performScanStage(stage, pluginIds);
			selectDefaultNode(response);
			return true;
		} catch (error) {
			setScanStatus(stage, 'error', getErrorMessage(error));
			return false;
		} finally {
			activeScan = null;
		}
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

	async function runInitialScan() {
		if (initialScanStarted && activeScan !== null) return;

		initialScanStarted = true;
		activeScan = 'all';
		const initialStages: ScanStage[] = ['installs', 'plugins'];
		for (const stage of initialStages) setScanStatus(stage, 'pending');

		let currentStage: ScanStage = 'installs';
		try {
			let response: HoudiniDiscoveryResponse | undefined;
			for (const stage of initialStages) {
				currentStage = stage;
				response = await performScanStage(stage);
			}
			if (response) {
				selectDefaultNode(response);
			}
		} catch (error) {
			setScanStatus(currentStage, 'error', getErrorMessage(error));
		} finally {
			activeScan = null;
		}
	}

	async function loadInitialDiscovery() {
		snapshotLoadState = 'loading';
		try {
			const snapshot = await fetchHoudiniDiscoverySnapshot();
			snapshotLoadState = 'ready';
			if (snapshot) {
				applyDiscovery(snapshot);
				selectDefaultNode(snapshot);
				return;
			}
		} catch {
			snapshotLoadState = 'error';
		}

		await runInitialScan();
	}

	async function runGlobalScan() {
		if (activeScan !== null) return;

		activeScan = 'all';
		for (const { stage } of scanStages) setScanStatus(stage, 'pending');

		let currentStage: ScanStage = 'installs';
		try {
			let response: HoudiniDiscoveryResponse | undefined;
			for (const { stage } of scanStages) {
				currentStage = stage;
				response = await performScanStage(stage);
			}
			if (response) {
				selectDefaultNode(response);
			}
		} catch (error) {
			setScanStatus(currentStage, 'error', getErrorMessage(error));
		} finally {
			activeScan = null;
		}
	}

	onMount(() => {
		restoreSelectedNode();
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

<svelte:document
	onmouseover={(event) => showTooltip(event.target)}
	onmouseout={hideTooltip}
	onfocusin={(event) => showTooltip(event.target)}
	onfocusout={hideTooltip}
/>
<svelte:window onkeydown={handleWindowKeydown} />

<div class="page-shell px-3.5 pb-4 sm:px-6 lg:px-10">
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
		<section
			class="library-surface rounded-xl border border-white/10 bg-white/[0.035] p-3 shadow-[0_18px_55px_rgba(0,0,0,0.22)] lg:p-4.5"
			id="library"
		>
			<div class="library-toolbar">
				<div class="flex flex-row gap-1.5">
					<button
						type="button"
						class="rescan-button p-2"
						aria-label="Rescan all"
						disabled={isScanActive}
						onclick={() => void runGlobalScan()}
						data-tooltip="Run all discovery stages"
					>
						<Play />
					</button>
					<div class="flex gap-1.5">
						{#each scanStages as scan (scan.stage)}
							<div
								class={[
									'scan-card',
									`scan-card-state-${scanStatuses[scan.stage].state}`,
									'flex',
									'flex-row',
									'gap-1.5'
								]}
							>
								<article
									class="pt-1 pb-1 pl-2.5"
									aria-labelledby={`scan-${scan.stage}-title`}
									aria-busy={scanStatuses[scan.stage].state === 'loading'}
								>
									<div class="scan-card-heading">
										<h3 id={`scan-${scan.stage}-title`}>{scan.label}</h3>
										<span
											class={[
												'scan-state',
												`scan-state-${scanStatuses[scan.stage].state}`,
												scanStatuses[scan.stage].source === 'saved' ? 'scan-state-saved' : ''
											]}
											role="status"
											aria-live="polite"
											aria-label={`${scan.label}: ${scanStateLabel(scan.stage)}`}
										>
											{scanStateLabel(scan.stage)}
										</span>
									</div>
									<p class="scan-card-meta">
										{#if scanStatuses[scan.stage].scannedAt}
											{@const stageScannedAt = scanStatuses[scan.stage].scannedAt}
											<time data-tooltip="Last scanned" datetime={stageScannedAt}
												>{formatScanTime(stageScannedAt)}</time
											>
										{:else}
											<span>Unscanned</span>
										{/if}
									</p>
								</article>
								<button
									type="button"
									class="scan-action p-2"
									aria-label={`${scan.stage === 'git' ? 'Sync' : 'Scan'} ${scan.label}`}
									disabled={isScanActive}
									onclick={() => void runStage(scan.stage)}
								>
									{#if scan.stage === 'git'}
										<CloudDownload />
									{:else}
										<Search class="green" />
									{/if}
								</button>
							</div>
						{/each}
					</div>
				</div>
				<div class="workspace-header">
					<div class="intro-stats" aria-label="Activation summary">
						<div><strong>{pluginCount}</strong><span>user plugins</span></div>
						<div><strong>{activationInstalls.length}</strong><span>Houdinis</span></div>
						<button
							type="button"
							class="attention-stat issue-stat"
							aria-haspopup="dialog"
							aria-expanded={issuesDialogOpen}
							disabled={!issueItems.length}
							onclick={() => openIssuesDialog()}
						>
							<strong>{attentionCount}</strong><span>Issues</span>
						</button>
					</div>
					<div class="workspace-actions flex w-full flex-wrap items-center gap-3 lg:w-auto">
						<div class="view-switch" role="group" aria-label="Library view">
							<button
								type="button"
								class={view === 'map' ? 'active' : ''}
								aria-pressed={view === 'map'}
								onclick={() => (view = 'map')}
							>
								Map
							</button>
							<button
								type="button"
								class={view === 'table' ? 'active' : ''}
								aria-pressed={view === 'table'}
								onclick={() => (view = 'table')}
							>
								Table
							</button>
						</div>
						<label class="search-field min-w-37.5 flex-1 sm:w-47.5 sm:flex-none">
							<span class="sr-only">Filter plugins or installs</span>
							<span class="search-icon">/</span>
							<input bind:value={searchQuery} type="search" placeholder="Filter library" />
						</label>
					</div>
				</div>
			</div>

			{#if discoveryState === 'loading'}
				<div class="workspace-state" aria-live="polite">
					<span class="state-mark">...</span>
					<h2>
						{snapshotLoadState === 'loading'
							? 'Loading saved discovery'
							: 'Scanning Houdini installs'}
					</h2>
					<p>
						{snapshotLoadState === 'loading'
							? 'Restoring the last completed scan while keeping startup responsive.'
							: "Running each discovered install's hconfig and inventorying package JSON files."}
					</p>
				</div>
			{:else if discoveryState === 'error' && !hasDiscoverySnapshot}
				<div class="workspace-state" aria-live="assertive">
					<span class="state-mark error">!</span>
					<h2>Houdini discovery is unavailable</h2>
					<p>{scanError}</p>
					<button type="button" class="rescan-button" onclick={() => void runInitialScan()}
						>Try again</button
					>
				</div>
			{:else if !activationInstalls.length}
				<div class="workspace-state">
					<span class="state-mark">+</span>
					<h2>No Houdini installs detected</h2>
					<p>
						HPM needs a Houdini installation with a readable hconfig executable before it can build
						this workspace.
					</p>
				</div>
			{:else if view === 'map'}
				<div class="map-layout">
					<div class="map-column">
						<ActivationMap
							nodes={visibleMapNodes}
							edges={visibleMapEdges}
							onselect={selectNode}
							{focusNodeId}
							onfocuscomplete={() => (focusNodeId = null)}
						/>
						<div class="surface-footer">
							<div class="status-legend" aria-label="Activation status legend">
								<span><i class="enabled"></i>Enabled</span>
								<span><i class="disabled"></i>Disabled</span>
								<span><i class="warning"></i>Review</span>
								<span><i class="incompatible"></i>Incompatible</span>
							</div>
							<span class="surface-count">{enabledCount} active targets</span>
						</div>
					</div>
					<PluginDetailPanel
						plugin={selectedPlugin}
						officialPlugins={selectedOfficialPlugins}
						install={selectedInstall}
						{selectedTargets}
						pluginTargetGroups={selectedPluginTargetGroups}
						pluginGitSource={selectedPlugin?.sources?.find(
							(source) => source.exists && source.versionSource === 'git'
						)}
						pluginVersions={selectedPluginVersions}
						{activationPlugins}
						{isScanActive}
						{pluginScanState}
						{pluginActionState}
						{gitSyncState}
						{gitSyncMessage}
						{installState}
						{installMessage}
						onRescanPluginConfigs={() => void rescanSelectedPluginConfigs()}
						onSyncGit={() => void syncSelectedPluginGit()}
						onPluginAction={(request) => void runSelectedPluginAction(request)}
						onOpenTargetConfig={openTargetConfigDialog}
						onOpenTargetIssueDetails={openTargetIssueDetails}
						onOpenInstallDialog={openInstallDialog}
					/>
				</div>
			{:else}
				<ActivationTable
					plugins={filteredPlugins}
					installs={activationInstalls}
					targets={activationTargets}
					selectedId={selectedNodeId}
					onselect={selectNode}
				/>
			{/if}
		</section>
		{#if hasDiscoverySnapshot && (discoveryDiagnostics.length || scannedAt)}
			<div class="scan-footer">
				<span
					>{discoveryDiagnostics.length
						? `${discoveryDiagnostics.length} workspace diagnostics`
						: 'hconfig scan complete'}</span
				>
				<div class="scan-footer-meta">
					{#if discoverySource === 'saved'}<span>Saved snapshot; may be stale.</span>{/if}
					{#if persistedAt}
						<time datetime={persistedAt}>Saved {formatScanTime(persistedAt)}</time>
					{:else if scannedAt}
						<time datetime={scannedAt}>Scanned {formatScanTime(scannedAt)}</time>
					{/if}
				</div>
			</div>
		{/if}
	</main>
	{#if installDialogOpen && selectedPlugin}
		<PluginInstallDialog
			plugin={selectedPlugin}
			versions={selectedPluginVersions}
			installs={activationInstalls}
			targets={activationTargets}
			{remoteSourceOptions}
			{hpmPluginDestination}
			{installState}
			message={installMessage}
			onClose={closeInstallDialog}
			onCancel={cancelInstall}
			onInstall={(request, options) => void installSelectedPlugin(request, options)}
		/>
	{/if}
	{#if issuesDialogOpen}
		<IssueChecker
			{issueItems}
			{issueConfigOptions}
			installs={activationInstalls}
			filterId={issueCheckerFilterId}
			{groupIssueBuilds}
			onClose={closeIssuesDialog}
			onFilterChange={(filterId) => (issueCheckerFilterId = filterId)}
			onGroupBuildsChange={(value) => (groupIssueBuilds = value)}
			onSelectIssue={selectIssue}
		/>
	{/if}
	{#if liveJsonEditorContext}
		<LiveJsonEditor
			plugin={liveJsonEditorContext.plugin}
			install={liveJsonEditorContext.install}
			target={liveJsonEditorContext.target}
			targets={activationTargets}
			{isScanActive}
			onClose={closeTargetConfigDialog}
			onDiscovery={(response) => applyDiscovery(response, 'plugins')}
		/>
	{/if}
	{#if targetIssueDetails}
		<TargetIssueDialog
			details={targetIssueDetails}
			actionsDisabled={isScanActive || pluginActionState === 'working'}
			onClose={closeTargetIssueDetails}
			onOpenConfig={(installId) =>
				void runSelectedPluginAction({ action: 'open-config', installId })}
			onOpenEditor={(installId, target) => {
				const install = activationInstalls.find((candidate) => candidate.id === installId);
				if (install) openTargetConfigDialog(install, target);
			}}
		/>
	{/if}
	{#if tooltip}
		<div
			class={['global-tooltip', `global-tooltip-${tooltip.placement}`]}
			style:left={`${tooltip.left}px`}
			style:top={`${tooltip.top}px`}
			role="tooltip"
		>
			{tooltip.text}
		</div>
	{/if}
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

	.library-surface {
		display: flex;
		min-height: 0;
		flex: 1;
		flex-direction: column;
		overflow: hidden;
	}

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
		font-size: 10px;
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

	.library-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 14px;
		padding: 9px;
		border: 1px solid rgba(211, 232, 225, 0.1);
		border-radius: 8px;
		background: rgba(8, 15, 13, 0.34);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025);
	}

	.scan-card {
		border: 1px solid var(--line);
		border-radius: 5px;
		background: rgba(255, 255, 255, 0.035);
		box-shadow: inset 2px 0 0 rgba(135, 148, 143, 0.35);
		transition:
			border-color 120ms ease,
			background-color 120ms ease;
	}

	.scan-card-state-loading {
		border-color: rgba(211, 155, 56, 0.35);
		box-shadow: inset 2px 0 0 #d39b38;
	}

	.scan-card-state-ready {
		border-color: rgba(57, 155, 130, 0.32);
		box-shadow: inset 2px 0 0 #399b82;
	}

	.scan-card-state-error {
		border-color: rgba(223, 109, 88, 0.42);
		box-shadow: inset 2px 0 0 #df6d58;
	}

	.scan-card-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.scan-card h3 {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
	}

	.scan-state {
		padding: 2px 4px;
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.scan-state-loading {
		border-color: rgba(224, 139, 27, 0.733);
		color: #f1841e;
	}

	.scan-state-ready {
		border-color: rgba(57, 155, 130, 0.45);
		color: #399b82;
	}

	.scan-state-saved {
		border-color: rgba(56, 211, 69, 0.479);
		color: #33c05d;
	}

	.scan-state-error {
		border-color: rgba(223, 109, 88, 0.45);
		color: #df6d58;
	}

	.scan-card-meta,
	.scan-card-source {
		margin: 0;
		color: var(--text-muted);
		font-size: 12px;
		line-height: 1.4;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.scan-card-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}

	.scan-card-meta span:first-child {
		color: var(--text-dim);
	}

	.scan-card-source {
		color: #d39b38;
	}

	.scan-card-error {
		margin: 0;
		color: #df6d58;
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
		line-height: 1.4;
		overflow-wrap: anywhere;
	}

	.scan-action {
		background: rgba(57, 156, 132, 0.12);
		color: var(--text);
		cursor: pointer;
		font-size: 10px;
		font-weight: 600;
		line-height: 1.3;
		text-align: center;
		white-space: normal;
		overflow-wrap: anywhere;
	}

	.scan-action:hover,
	.scan-action:focus-visible {
		border-color: #399b82;
		background: rgba(57, 155, 131, 0.288);
		outline: none;
	}

	.scan-action:disabled,
	.rescan-button:disabled {
		cursor: wait;
		opacity: 0.55;
	}

	.section-kicker {
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	h3,
	p {
		margin-top: 0;
	}

	.intro-stats {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0;
	}

	.intro-stats div,
	.intro-stats button {
		min-width: 64px;
		padding-left: 8px;
		border-left: 1px solid var(--line-strong);
	}

	.intro-stats button {
		margin: 0;
		border-top: 0;
		border-right: 0;
		border-bottom: 0;
		background: transparent;
		font: inherit;
		text-align: left;
	}

	.intro-stats strong,
	.intro-stats span {
		display: block;
	}

	.intro-stats strong {
		font-size: 20px;
		font-weight: 600;
	}

	.intro-stats span {
		margin-top: 1px;
		color: var(--text-muted);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.workspace-header {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 12px;
		min-width: max-content;
		padding-left: 16px;
	}

	.workspace-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.intro-stats .attention-stat strong {
		color: #f07b67;
	}

	.issue-stat {
		color: inherit;
		cursor: pointer;
		transition: color 120ms ease;
	}

	.issue-stat:hover:not(:disabled),
	.issue-stat:focus-visible:not(:disabled) {
		border-left-color: rgba(223, 109, 88, 0.7);
		background: rgba(223, 109, 88, 0.08);
		color: #ffb09f;
		outline: none;
	}

	.issue-stat:hover:not(:disabled) strong,
	.issue-stat:focus-visible:not(:disabled) strong,
	.issue-stat:hover:not(:disabled) span,
	.issue-stat:focus-visible:not(:disabled) span {
		color: #ffb09f;
	}

	.issue-stat:focus-visible:not(:disabled) {
		outline: 2px solid #f07b67;
		outline-offset: 4px;
	}

	.issue-stat:disabled {
		cursor: default;
		opacity: 0.72;
	}

	.view-switch {
		display: flex;
		padding: 2px;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.045);
	}

	.view-switch button {
		min-width: 48px;
		padding: 5px 8px;
		border: 0;
		border-radius: 4px;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 11px;
		font-weight: 600;
	}

	.view-switch button.active {
		background: #263732;
		box-shadow: 0 2px 7px rgba(0, 0, 0, 0.22);
		color: var(--text);
	}

	.search-field {
		display: flex;
		align-items: center;
		gap: 9px;
		width: 150px;
		padding: 5px 8px;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.045);
		color: var(--text-muted);
	}

	.search-icon {
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 14px;
		font-weight: 700;
		transform: rotate(-45deg);
	}

	.search-field input {
		width: 100%;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--text);
		font-size: 12px;
	}

	.search-field input::placeholder {
		color: #71827c;
	}

	.rescan-button {
		border: 1px solid var(--line-strong);
		border-radius: 5px;
		background: rgba(255, 255, 255, 0.045);
		color: var(--text);
		cursor: pointer;
		font-size: 9px;
		font-weight: 600;
	}

	.rescan-button:hover,
	.rescan-button:focus-visible {
		border-color: #399b82;
		outline: none;
	}

	.workspace-state {
		display: flex;
		flex: 1;
		min-height: 0;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		gap: 10px;
		padding: 32px;
		color: var(--text-muted);
		text-align: center;
	}

	.workspace-state h2,
	.workspace-state p {
		max-width: 470px;
		margin: 0;
	}

	.workspace-state h2 {
		color: var(--text);
		font-size: 22px;
		font-weight: 600;
	}

	.workspace-state p {
		font-size: 13px;
		line-height: 1.55;
	}

	.state-mark {
		display: grid;
		width: 40px;
		height: 40px;
		place-items: center;
		border: 1px dashed var(--line-strong);
		border-radius: 50%;
		color: #399b82;
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 16px;
	}

	.state-mark.error {
		border-color: #df6d58;
		color: #df6d58;
	}

	.map-layout {
		display: grid;
		flex: 1;
		min-height: 0;
		grid-template-columns: minmax(0, 1fr) 700px;
	}

	.map-column {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
	}

	.surface-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}

	.status-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 13px;
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
		letter-spacing: 0.02em;
		text-transform: uppercase;
	}

	.status-legend span {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}

	.status-legend i {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #399b82;
	}

	.status-legend i.disabled {
		background: #87948f;
	}

	.status-legend i.warning {
		background: #d39b38;
	}

	.status-legend i.incompatible {
		background: #df6d58;
	}

	.surface-count {
		color: var(--text-muted);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
		white-space: nowrap;
	}

	.global-tooltip {
		position: fixed;
		z-index: 10000;
		max-width: min(320px, calc(100vw - 24px));
		padding: 6px 8px;
		border: 1px solid rgba(211, 232, 225, 0.18);
		border-radius: 4px;
		background: #17221f;
		box-shadow: 0 8px 18px rgba(0, 0, 0, 0.22);
		color: var(--text);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
		line-height: 1.35;
		pointer-events: none;
		white-space: nowrap;
		transform: translateX(-50%);
	}

	.global-tooltip-above {
		transform: translate(-50%, -100%);
	}

	.scan-footer-meta {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 10px;
		text-align: right;
	}

	.scan-footer {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		padding: 10px 3px 0;
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
		letter-spacing: 0.03em;
		text-transform: uppercase;
	}

	@media (max-width: 1100px) {
		.library-toolbar {
			gap: 10px;
		}

		.workspace-header {
			justify-content: flex-start;
			min-width: 0;
			padding-top: 2px;
			padding-left: 0;
			border-top: 1px solid var(--line);
			border-left: 0;
		}

		.map-layout {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: minmax(0, 1fr) minmax(0, 0.72fr);
		}
	}

	@media (max-width: 760px) {
		.library-toolbar {
			gap: 12px;
		}

		.workspace-header {
			align-items: stretch;
			flex-direction: column;
		}

		.workspace-actions {
			width: 100%;
		}

		.workspace-actions .search-field {
			min-width: 0;
			flex: 1;
		}

		.map-layout {
			grid-template-rows: minmax(0, 1fr) minmax(0, 0.8fr);
		}

		nav a {
			white-space: nowrap;
		}

		.surface-footer {
			align-items: start;
			flex-direction: column;
		}
	}
</style>
