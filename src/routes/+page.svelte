<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import ActivationMap from '$lib/activation-map/ActivationMap.svelte';
	import ActivationTable from '$lib/activation-map/ActivationTable.svelte';
	import {
		createActivationGraph,
		isOfficialPlugin,
		OFFICIAL_NODE_ID,
		statusLabel,
		targetFor
	} from '$lib/activation-map/model';
	import type {
		ActivationEdge,
		ActivationNode,
		ActivationTarget,
		HoudiniDiscoveryDiagnostic,
		HoudiniInstall,
		PluginRecord
	} from '$lib/activation-map/types';
	import type { HoudiniDiscoveryResponse } from '$lib/houdini/types';
	import logo from '$lib/assets/hpm.svg';
	import {
		fetchHoudiniDiscoverySnapshot,
		installHoudiniPlugin,
		runHoudiniPluginAction,
		scanHoudiniWorkspace
	} from '$lib/houdini/client';

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
	type ActionState = 'idle' | 'working' | 'success' | 'error';
	type PluginTargetGroup = {
		representativeInstall: HoudiniInstall;
		target: ActivationTarget;
		installs: HoudiniInstall[];
	};

	const scanStages: Array<{ stage: ScanStage; label: string }> = [
		{
			stage: 'installs',
			label: 'Houdini installs'
		},
		{
			stage: 'plugins',
			label: 'Plugin inventory'
		},
		{
			stage: 'git',
			label: 'Remote Git metadata'
		}
	];
	const scanStageLabels: Record<ScanStage, string> = {
		installs: 'Houdini installs',
		plugins: 'plugin inventory',
		git: 'remote Git metadata'
	};
	const selectedNodeStorageKey = 'hpm:last-selected-node';

	let view = $state<ViewMode>('map');
	let searchQuery = $state('');
	let selectedNodeId = $state<string | null>(null);
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
	let installVersion = $state('');
	let installScope = $state<'global' | 'install'>('global');
	let installTargetId = $state('');
	let installState = $state<'idle' | 'working' | 'success' | 'error'>('idle');
	let installMessage = $state('');
	let installController: AbortController | null = null;
	let gitSyncState = $state<ActionState>('idle');
	let gitSyncMessage = $state('');
	let pluginActionState = $state<ActionState>('idle');
	let pluginActionMessage = $state('');

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
	let attentionCount = $derived(
		activationTargets.filter((target) =>
			['warning', 'incompatible', 'missing'].includes(target.status)
		).length
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
	let requestedInstallVersion = $derived(
		installVersion || selectedPluginVersions[0] || selectedPlugin?.version || ''
	);
	let requestedInstallId = $derived(installTargetId);
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

		const matchingIds = activationNodes
			.filter((node) =>
				(node.data.searchText ?? `${node.data.label} ${node.data.meta}`)
					.toLowerCase()
					.includes(normalizedQuery)
			)
			.map((node) => node.id);

		for (const edge of activationEdges) {
			if (matchingIds.includes(edge.source) || matchingIds.includes(edge.target)) {
				if (!matchingIds.includes(edge.source)) matchingIds.push(edge.source);
				if (!matchingIds.includes(edge.target)) matchingIds.push(edge.target);
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

		const groups: PluginTargetGroup[] = [];
		for (const install of activationInstalls) {
			const target = targetFor(activationTargets, plugin.id, install.id);
			if (!target) continue;

			const existing = groups.find(
				(group) => group.representativeInstall.version === install.version
			);
			if (existing) {
				existing.installs.push(install);
				continue;
			}

			groups.push({
				representativeInstall: install,
				target,
				installs: [install]
			});
		}

		return groups;
	});

	function installBuildLabel(installs: HoudiniInstall[]): string {
		const platforms = [...new Set(installs.map((install) => install.platform))];
		if (platforms.length === 1) {
			const builds = [...new Set(installs.map((install) => install.build))];
			return `${platforms[0]} / ${builds.join(', ')}`;
		}

		return installs
			.map((install) => `${install.platform} / ${install.build}`)
			.filter((label, index, labels) => labels.indexOf(label) === index)
			.join(', ');
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
		selectedNodeId = id;
		persistSelectedNode(id);
		installVersion = '';
		installState = 'idle';
		installMessage = '';
		gitSyncState = 'idle';
		gitSyncMessage = '';
		pluginActionState = 'idle';
		pluginActionMessage = '';
	}

	async function refreshSelectedPlugin() {
		const plugin = selectedPlugin;
		if (!plugin || isScanActive) return;
		pluginActionState = 'working';
		pluginActionMessage = '';
		const refreshed = await runStage('plugins', [plugin.id]);
		if (selectedPlugin?.id !== plugin.id) return;
		if (refreshed) {
			pluginActionState = 'success';
			pluginActionMessage = 'Plugin refreshed';
		} else {
			pluginActionState = 'error';
			pluginActionMessage = scanStatuses.plugins.error || 'Plugin refresh failed';
		}
	}

	async function runSelectedPluginAction(
		request:
			| { action: 'open-config' | 'open-package-folder'; installId: string }
			| { action: 'open-source'; sourcePath: string }
			| { action: 'set-enabled'; installId: string; enabled: boolean }
	) {
		const plugin = selectedPlugin;
		if (!plugin || isScanActive || pluginActionState === 'working') return;

		pluginActionState = 'working';
		pluginActionMessage = '';
		try {
			const result = await runHoudiniPluginAction({ pluginId: plugin.id, ...request });
			if (result.discovery) applyDiscovery(result.discovery, 'plugins');
			pluginActionState = 'success';
			pluginActionMessage = result.message;
		} catch (error) {
			pluginActionState = 'error';
			pluginActionMessage = getErrorMessage(error);
		}
	}

	function stopActionPropagation(event: MouseEvent) {
		event.stopPropagation();
	}

	async function installSelectedPlugin() {
		const plugin = selectedPlugin;
		if (
			!plugin ||
			!requestedInstallVersion ||
			!selectedPluginVersions.includes(requestedInstallVersion) ||
			(installScope === 'install' && !requestedInstallId)
		) {
			return;
		}

		installState = 'working';
		installMessage = '';
		const controller = new AbortController();
		installController = controller;
		try {
			const result = await installHoudiniPlugin(
				{
					pluginId: plugin.id,
					version: requestedInstallVersion,
					scope: installScope,
					installId: installScope === 'install' ? requestedInstallId : undefined
				},
				controller.signal
			);
			applyDiscovery(result.discovery, 'all');
			installState = 'success';
			installMessage = result.message;
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

<div class="min-h-screen px-3.5 pb-7 sm:px-6 lg:px-10 lg:pb-13.5">
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

	<main class="mx-auto">
		<section
			class="rounded-xl border border-white/10 bg-white/[0.035] p-4 shadow-[0_18px_55px_rgba(0,0,0,0.22)] lg:p-6.5"
			id="library"
		>
			<div class="scan-status-panel" aria-labelledby="scan-status-title">
				<div class="scan-status-header">
					<div>
						<p class="section-kicker">Workspace scan</p>
						<h2 id="scan-status-title">Discovery stages</h2>
					</div>
					<button
						type="button"
						class="rescan-button"
						disabled={isScanActive}
						onclick={() => void runGlobalScan()}>Rescan all</button
					>
				</div>
				<div class="scan-status-grid">
					{#each scanStages as scan (scan.stage)}
						<article
							class="scan-card"
							aria-labelledby={`scan-${scan.stage}-title`}
							aria-busy={scanStatuses[scan.stage].state === 'loading'}
						>
							<div class="scan-card-heading">
								<div>
									<h3 id={`scan-${scan.stage}-title`}>{scan.label}</h3>
								</div>
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
									<span>{scan.stage === 'git' ? 'Last synced' : 'Last scanned'}</span>
									<time datetime={stageScannedAt}>
										{formatScanTime(stageScannedAt)}
									</time>
								{:else}
									<span>Not yet scanned</span>
								{/if}
							</p>
							{#if scanStatuses[scan.stage].source === 'saved'}
								<p class="scan-card-source">Saved locally; may be stale.</p>
							{/if}
							{#if scanStatuses[scan.stage].error}
								<p class="scan-card-error" aria-live="polite">
									{scanStatuses[scan.stage].error}
								</p>
							{/if}
							<button
								type="button"
								class="scan-action"
								aria-label={`${scan.stage === 'git' ? 'Sync' : 'Scan'} ${scan.label}`}
								disabled={isScanActive}
								onclick={() => void runStage(scan.stage)}
							>
								{scan.stage === 'git' ? 'Sync' : 'Scan'}
							</button>
						</article>
					{/each}
				</div>
			</div>
			<div
				class="workspace-header flex flex-col gap-5 border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between"
			>
				<div class="intro-stats" aria-label="Activation summary">
					<div><strong>{activationPlugins.length}</strong><span>plugins</span></div>
					<div><strong>{activationInstalls.length}</strong><span>installs</span></div>
					<div class="attention-stat">
						<strong>{attentionCount}</strong><span>review states</span>
					</div>
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
						<ActivationMap nodes={visibleMapNodes} edges={visibleMapEdges} onselect={selectNode} />
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
					<aside class="detail-panel" aria-live="polite">
						{#if selectedPlugin}
							<p class="section-kicker">Plugin detail</p>
							<h3>{selectedPlugin.name}</h3>
							<p class="detail-description">{selectedPlugin.description}</p>
							<div class="detail-meta">
								<span>{selectedPlugin.version}</span>
								{#if selectedPlugin.installedVersions && selectedPlugin.installedVersions.length > 1}
									<span>{selectedPlugin.installedVersions.length} installed versions</span>
								{/if}
								{#if selectedPlugin.versionSource === 'git'}<span>Git tag / ref</span>{/if}
								<span>{selectedPlugin.license}</span>
								<span>{selectedPlugin.source}</span>
							</div>
							{#if selectedPlugin.sources?.length}
								<div class="source-list">
									<div class="target-heading">
										<span>Discovered sources</span>
										<span>{selectedPlugin.sources.length}</span>
									</div>
									<div class="target-list">
										{#each selectedPlugin.sources as source (source.path)}
											<div class="target-item target-item-actions">
												<div>
													<strong>{source.version ?? 'Unversioned source'}</strong>
													<small>{source.path}</small>
												</div>
												<div class="target-actions">
													<span
														class={[
															'status-pill',
															source.exists ? 'status-enabled' : 'status-missing'
														]}
													>
														{source.exists ? 'Available' : 'Missing'}
													</span>
													<div
														class="node-action-row"
														aria-label={`${source.version ?? 'Source'} plugin actions`}
													>
														<button
															type="button"
															class="node-action-button"
															aria-label={`Open plugin folder for ${selectedPlugin.name} at ${source.path}`}
															disabled={!source.exists ||
																isScanActive ||
																pluginActionState === 'working'}
															onclick={(event) => {
																stopActionPropagation(event);
																void runSelectedPluginAction({
																	action: 'open-source',
																	sourcePath: source.path
																});
															}}
														>
															Open plugin folder
														</button>
													</div>
												</div>
											</div>
										{/each}
									</div>
								</div>
							{/if}
							<div class="plugin-actions">
								{#if pluginActionMessage}
									<p
										class={['plugin-action-message', `is-${pluginActionState}`]}
										aria-live="polite"
									>
										{pluginActionMessage}
									</p>
								{/if}
								{#if selectedPlugin.repositoryUrl}
									<button
										type="button"
										class="sync-button"
										disabled={isScanActive || gitSyncState === 'working'}
										onclick={(event) => {
											stopActionPropagation(event);
											void syncSelectedPluginGit();
										}}
									>
										{gitSyncState === 'working' ? 'Syncing Git...' : 'Sync Git'}
									</button>
									{#if gitSyncMessage}
										<p class={['git-sync-message', `is-${gitSyncState}`]} aria-live="polite">
											{gitSyncMessage}
										</p>
									{/if}
									<a
										class="source-button"
										href={selectedPlugin.repositoryUrl}
										target="_blank"
										rel="external noopener noreferrer">Open source</a
									>
								{/if}
								{#if selectedPluginVersions.length}
									<div class="install-controls">
										<label>
											<span>Version</span>
											<select
												value={requestedInstallVersion}
												onchange={(event) =>
													(installVersion = (event.currentTarget as HTMLSelectElement).value)}
											>
												{#each selectedPluginVersions as version (version)}
													<option value={version}>{version}</option>
												{/each}
											</select>
										</label>
										<label>
											<span>Install scope</span>
											<select bind:value={installScope}>
												<option value="global">All Houdini installs</option>
												<option value="install">One Houdini install</option>
											</select>
										</label>
										{#if installScope === 'install'}
											<label>
												<span>Target install</span>
												<select bind:value={installTargetId}>
													<option value="" hidden>Select an install</option>
													{#each activationInstalls as install (install.id)}
														<option value={install.id}>{install.label} / {install.build}</option>
													{/each}
												</select>
											</label>
										{/if}
										<button
											type="button"
											class="install-button"
											disabled={installState === 'working' ||
												!requestedInstallVersion ||
												(installScope === 'install' && !requestedInstallId)}
											onclick={() => void installSelectedPlugin()}
										>
											{installState === 'working' ? 'Installing...' : 'Install version'}
										</button>
										{#if installState === 'working'}
											<button type="button" class="cancel-button" onclick={cancelInstall}>
												Cancel installation
											</button>
										{/if}
									</div>
								{/if}
								{#if installMessage}
									<p class={['install-message', `is-${installState}`]} aria-live="polite">
										{installMessage}
									</p>
								{/if}
							</div>
							<div class="target-heading">
								<span>Target installs</span>
								<span>{selectedPluginTargetGroups.length}</span>
							</div>
							<div class="target-list">
								{#each selectedPluginTargetGroups as group (group.representativeInstall.version)}
									{@const install = group.representativeInstall}
									{@const target = group.target}
									<div class="target-item target-item-actions">
										<div>
											<strong>{install.label}</strong>
											<small>{installBuildLabel(group.installs)}</small>
										</div>
										<div class="target-actions">
											<span class={['status-pill', `status-${target.status}`]}
												>{statusLabel(target.status)}</span
											>
											<div class="node-action-row" aria-label={`${install.label} plugin actions`}>
												<button
													type="button"
													class="node-action-button"
													disabled={isScanActive || pluginActionState === 'working'}
													onclick={(event) => {
														stopActionPropagation(event);
														void refreshSelectedPlugin();
													}}
												>
													{pluginActionState === 'working' ? 'Working...' : 'Rescan config'}
												</button>
												{#if target.status !== 'missing'}
													<button
														type="button"
														class="node-action-button"
														aria-label={`Open JSON config for ${install.label}`}
														disabled={isScanActive || pluginActionState === 'working'}
														onclick={(event) => {
															stopActionPropagation(event);
															void runSelectedPluginAction({
																action: 'open-config',
																installId: install.id
															});
														}}
													>
														Open config
													</button>
												{/if}
												<button
													type="button"
													class="node-action-button"
													aria-label={`Open packages folder for ${install.label}`}
													disabled={isScanActive || pluginActionState === 'working'}
													onclick={(event) => {
														stopActionPropagation(event);
														void runSelectedPluginAction({
															action: 'open-package-folder',
															installId: install.id
														});
													}}
												>
													Open /packages
												</button>
												{#if target.status !== 'missing'}
													<button
														type="button"
														class="node-action-button"
														class:danger={target.status === 'enabled'}
														aria-label={`${target.status === 'enabled' ? 'Disable' : 'Enable'} plugin for ${install.label}`}
														disabled={isScanActive || pluginActionState === 'working'}
														onclick={(event) => {
															stopActionPropagation(event);
															void runSelectedPluginAction({
																action: 'set-enabled',
																installId: install.id,
																enabled: target.status !== 'enabled'
															});
														}}
													>
														{target.status === 'enabled' ? 'Disable plugin' : 'Enable plugin'}
													</button>
												{/if}
											</div>
										</div>
									</div>
								{/each}
							</div>
						{:else if selectedOfficialPlugins.length}
							<p class="section-kicker">Official package group</p>
							<h3>Official Houdini packages</h3>
							<p class="detail-description">
								These package configs ship with Houdini or SideFX Labs and are grouped here to keep
								the map focused on user-installed plugins.
							</p>
							<div class="detail-meta">
								<span>SideFX</span>
								<span>{selectedOfficialPlugins.length} package configs</span>
								<span>Install + site roots</span>
							</div>
							<div class="target-heading">
								<span>Included packages</span>
								<span>{selectedOfficialPlugins.length}</span>
							</div>
							<div class="target-list">
								{#each selectedOfficialPlugins as plugin (plugin.id)}
									{@const packageTargets = activationTargets.filter(
										(target) => target.pluginId === plugin.id
									)}
									{@const enabledTargets = packageTargets.filter(
										(target) => target.status === 'enabled'
									).length}
									<div class="target-item">
										<div>
											<strong>{plugin.name}</strong>
											<small
												>{plugin.packageFile} / {plugin.origin} / {enabledTargets} enabled targets</small
											>
										</div>
										<span class="status-pill status-enabled">Official</span>
									</div>
								{/each}
							</div>
						{:else if selectedInstall}
							<p class="section-kicker">Install detail</p>
							<h3>{selectedInstall.label}</h3>
							<p class="detail-description">
								{selectedInstall.role}. hconfig resolved {selectedInstall.packageCount} package configs
								for this install.
							</p>
							<div class="install-facts">
								<div><span>Build</span><strong>{selectedInstall.build}</strong></div>
								<div><span>Platform</span><strong>{selectedInstall.platform}</strong></div>
								<div><span>Packages</span><strong>{selectedInstall.packageCount}</strong></div>
							</div>
							<div class="path-facts">
								<div><span>HFS</span><code>{selectedInstall.hfs}</code></div>
								<div><span>hconfig</span><code>{selectedInstall.hconfig}</code></div>
								<div>
									<span>User preferences</span><code>{selectedInstall.userPreferences}</code>
								</div>
								<div>
									<span>User package directory</span><code>{selectedInstall.packageDirectory}</code>
								</div>
							</div>
							<div class="package-roots">
								<span>Scanned package roots</span>
								{#each selectedInstall.packageRoots as root (root.path)}
									<code>{root.origin}: {root.path}</code>
								{/each}
							</div>
							{#if selectedInstall.diagnostics.length}
								<div class="diagnostics">
									<strong>Scan diagnostics</strong>
									{#each selectedInstall.diagnostics as diagnostic (diagnostic)}
										<p>{diagnostic}</p>
									{/each}
								</div>
							{/if}
							<div class="target-heading">
								<span>Plugin targets</span>
								<span>{selectedTargets.length}</span>
							</div>
							<div class="target-list">
								{#each selectedTargets as target (target.pluginId)}
									{@const plugin = activationPlugins.find((item) => item.id === target.pluginId)}
									<div class="target-item">
										<div>
											<strong>{plugin?.name}</strong>
											<small>{target.artifactVersion ?? 'No artifact resolved'}</small>
										</div>
										<span class={['status-pill', `status-${target.status}`]}
											>{statusLabel(target.status)}</span
										>
									</div>
								{/each}
							</div>
						{:else}
							<div class="detail-empty">
								<span class="empty-mark">+</span>
								<p>Select a node to inspect its targets.</p>
							</div>
						{/if}
					</aside>
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
</div>

<style>
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

	.scan-status-panel {
		margin-bottom: 20px;
		padding-bottom: 18px;
		border-bottom: 1px solid var(--line);
	}

	.scan-status-header {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 12px;
	}

	.scan-status-header h2 {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
	}

	.scan-status-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}

	.scan-card {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 8px;
		padding: 10px;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.025);
	}

	.scan-card-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.scan-card h3 {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
	}

	.scan-state {
		padding: 4px 6px;
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 8px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.scan-state-loading {
		border-color: rgba(211, 155, 56, 0.45);
		color: #d39b38;
	}

	.scan-state-ready {
		border-color: rgba(57, 155, 130, 0.45);
		color: #399b82;
	}

	.scan-state-saved {
		border-color: rgba(211, 155, 56, 0.45);
		color: #d39b38;
	}

	.scan-state-error {
		border-color: rgba(223, 109, 88, 0.45);
		color: #df6d58;
	}

	.scan-card-meta,
	.scan-card-source {
		margin: 0;
		color: var(--text-muted);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
		line-height: 1.4;
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
		font-size: 9px;
		line-height: 1.4;
		overflow-wrap: anywhere;
	}

	.scan-action {
		width: 100%;
		min-height: 32px;
		margin-top: auto;
		padding: 7px 9px;
		border: 1px solid var(--line-strong);
		border-radius: 5px;
		background: var(--surface-raised);
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
		outline: none;
	}

	.scan-action:disabled,
	.rescan-button:disabled {
		cursor: wait;
		opacity: 0.55;
	}

	.section-kicker {
		margin: 0 0 12px;
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
		align-self: end;
		gap: 28px;
		padding-bottom: 3px;
	}

	.intro-stats div {
		min-width: 82px;
		padding-left: 14px;
		border-left: 1px solid var(--line-strong);
	}

	.intro-stats strong,
	.intro-stats span {
		display: block;
	}

	.intro-stats strong {
		font-size: 29px;
		font-weight: 600;
	}

	.intro-stats span {
		margin-top: 4px;
		color: var(--text-muted);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.intro-stats .attention-stat strong {
		color: #f07b67;
	}

	.view-switch {
		display: flex;
		padding: 3px;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-muted);
	}

	.view-switch button {
		min-width: 64px;
		padding: 7px 11px;
		border: 0;
		border-radius: 4px;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 11px;
		font-weight: 600;
	}

	.view-switch button.active {
		background: var(--surface-raised);
		box-shadow: 0 2px 7px rgba(0, 0, 0, 0.22);
		color: var(--text);
	}

	.search-field {
		display: flex;
		align-items: center;
		gap: 9px;
		width: 190px;
		padding: 7px 11px;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-raised);
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
		padding: 8px 11px;
		border: 1px solid var(--line-strong);
		border-radius: 5px;
		background: var(--surface-muted);
		color: var(--text);
		cursor: pointer;
		font-size: 11px;
		font-weight: 600;
	}

	.rescan-button:hover,
	.rescan-button:focus-visible {
		border-color: #399b82;
		outline: none;
	}

	.workspace-state {
		display: flex;
		min-height: min(420px, calc(100dvh - 280px));
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
		height: calc(100dvh - 320px);
		min-height: 0;
		grid-template-columns: minmax(0, 1fr) 550px;
		gap: 18px;
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

	.detail-panel {
		min-height: 0;
		overflow-y: auto;
		padding: 24px;
	}

	.detail-panel h3 {
		margin-bottom: 12px;
		font-size: 27px;
		font-weight: 600;
		letter-spacing: -0.02em;
	}

	.detail-description {
		margin-bottom: 18px;
		color: var(--text-muted);
		font-size: 13px;
		line-height: 1.55;
	}

	.detail-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 36px;
	}

	.detail-meta span {
		padding: 5px 7px;
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--text-muted);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
	}

	.plugin-actions {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-bottom: 30px;
		padding: 12px;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-muted);
	}

	.node-action-row {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 6px;
	}

	.node-action-button {
		min-width: 0;
		padding: 7px 8px;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: var(--surface-raised);
		color: var(--text-muted);
		cursor: pointer;
		font-size: 10px;
		font-weight: 600;
		line-height: 1.25;
	}

	.node-action-button:hover,
	.node-action-button:focus-visible {
		border-color: #399b82;
		color: var(--text);
		outline: none;
	}

	.node-action-button.danger {
		border-color: rgba(223, 109, 88, 0.42);
		color: #df6d58;
	}

	.node-action-button:disabled {
		cursor: wait;
		opacity: 0.55;
	}

	.plugin-action-message {
		margin: 0;
		color: var(--text-muted);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
		line-height: 1.45;
	}

	.plugin-action-message.is-success {
		color: #399b82;
	}

	.plugin-action-message.is-error {
		color: #df6d58;
	}

	.source-button,
	.sync-button,
	.install-button,
	.cancel-button {
		align-self: flex-start;
		padding: 7px 10px;
		border: 1px solid var(--line-strong);
		border-radius: 5px;
		background: var(--surface-raised);
		color: var(--text);
		cursor: pointer;
		font-size: 11px;
		font-weight: 600;
		text-decoration: none;
	}

	.source-button:hover,
	.source-button:focus-visible,
	.sync-button:hover,
	.sync-button:focus-visible,
	.install-button:hover,
	.install-button:focus-visible,
	.cancel-button:hover,
	.cancel-button:focus-visible {
		border-color: #399b82;
		outline: none;
	}

	.install-button:disabled {
		cursor: wait;
		opacity: 0.55;
	}

	.sync-button:disabled {
		cursor: wait;
		opacity: 0.55;
	}

	.git-sync-message {
		margin: 0;
		color: var(--text-muted);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
		line-height: 1.45;
	}

	.git-sync-message.is-success {
		color: #399b82;
	}

	.git-sync-message.is-error {
		color: #df6d58;
	}

	.install-controls {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 9px;
	}

	.install-controls label {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 5px;
	}

	.install-controls label span {
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 8px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.install-controls select {
		min-width: 0;
		padding: 7px 8px;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: var(--surface-raised);
		color: var(--text);
		font-size: 11px;
	}

	.install-controls .install-button {
		grid-column: 1 / -1;
		justify-self: start;
	}

	.install-controls .cancel-button {
		grid-column: 1 / -1;
		justify-self: start;
		border-color: rgba(223, 109, 88, 0.5);
		color: #df6d58;
	}

	.install-message {
		margin: 0;
		color: var(--text-muted);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
		line-height: 1.45;
	}

	.install-message.is-success {
		color: #399b82;
	}

	.install-message.is-error {
		color: #df6d58;
	}

	.target-heading {
		display: flex;
		justify-content: space-between;
		margin-bottom: 12px;
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.target-list {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.target-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 0;
		border-top: 1px solid var(--line);
	}

	.target-item-actions {
		align-items: flex-start;
		flex-direction: column;
	}

	.target-actions {
		display: flex;
		width: 100%;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
	}

	.target-actions .node-action-row {
		flex: 1;
	}

	.target-item strong,
	.target-item small {
		display: block;
	}

	.target-item strong {
		font-size: 12px;
		font-weight: 600;
	}

	.target-item small {
		margin-top: 4px;
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
	}

	.status-pill {
		padding: 5px 7px;
		border-radius: 4px;
		background: rgba(57, 155, 130, 0.16);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
		font-weight: 600;
		white-space: nowrap;
	}

	.status-pill.status-disabled,
	.status-pill.status-missing {
		background: rgba(173, 119, 105, 0.18);
	}

	.status-pill.status-warning {
		background: rgba(211, 155, 56, 0.18);
	}

	.status-pill.status-incompatible {
		background: rgba(223, 109, 88, 0.18);
	}

	.install-facts {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
		margin: 26px 0 36px;
	}

	.install-facts div {
		padding: 10px 9px;
		border: 1px solid var(--line);
		border-radius: 5px;
	}

	.install-facts span,
	.install-facts strong {
		display: block;
	}

	.path-facts {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 28px;
	}

	.path-facts div {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--line);
	}

	.path-facts span,
	.path-facts code,
	.diagnostics strong,
	.diagnostics p,
	.scan-footer {
		font-family: 'Cascadia Code', 'Courier New', monospace;
	}

	.path-facts span {
		color: var(--text-dim);
		font-size: 8px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.scan-footer-meta {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 10px;
		text-align: right;
	}

	.path-facts code {
		overflow-wrap: anywhere;
		color: var(--text-muted);
		font-size: 10px;
		line-height: 1.4;
	}

	.package-roots {
		display: flex;
		flex-direction: column;
		gap: 5px;
		margin: -18px 0 24px;
	}

	.package-roots > span {
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 8px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.package-roots code {
		overflow-wrap: anywhere;
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
		line-height: 1.4;
	}

	.diagnostics {
		margin-bottom: 24px;
		padding: 10px;
		border: 1px solid rgba(223, 109, 88, 0.32);
		border-radius: 5px;
		background: rgba(223, 109, 88, 0.07);
	}

	.diagnostics strong {
		color: #df6d58;
		font-size: 9px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.diagnostics p {
		margin: 7px 0 0;
		color: var(--text-muted);
		font-size: 10px;
		line-height: 1.45;
	}

	.scan-footer {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		padding: 10px 3px 0;
		color: var(--text-dim);
		font-size: 9px;
		letter-spacing: 0.03em;
		text-transform: uppercase;
	}

	.install-facts span {
		margin-bottom: 5px;
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 8px;
		text-transform: uppercase;
	}

	.install-facts strong {
		font-size: 12px;
	}

	.detail-empty {
		display: flex;
		min-height: 280px;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		gap: 12px;
		color: var(--text-muted);
		text-align: center;
	}

	.detail-empty p {
		max-width: 170px;
		margin: 0;
		font-size: 12px;
		line-height: 1.5;
	}

	.empty-mark {
		display: grid;
		width: 36px;
		height: 36px;
		place-items: center;
		border: 1px dashed var(--line-strong);
		border-radius: 50%;
		color: var(--text-muted);
		font-size: 20px;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	@media (max-width: 1100px) {
		.map-layout {
			height: calc(100dvh - 340px);
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: minmax(0, 1fr) minmax(0, 0.72fr);
		}

		.detail-panel {
			min-height: 0;
			padding: 24px 4px 4px;
			overflow-y: auto;
			border-top: 1px solid rgba(38, 53, 55, 0.1);
			border-left: 0;
		}

		.detail-empty {
			min-height: 160px;
		}
	}

	@media (max-width: 760px) {
		.scan-status-header {
			align-items: stretch;
			flex-direction: column;
		}

		.scan-status-header .rescan-button {
			width: 100%;
			white-space: normal;
		}

		.scan-status-grid {
			grid-template-columns: minmax(0, 1fr);
		}

		.map-layout {
			height: calc(100dvh - 350px);
			grid-template-rows: minmax(0, 1fr) minmax(0, 0.8fr);
		}

		nav a {
			white-space: nowrap;
		}

		.surface-footer {
			align-items: start;
			flex-direction: column;
		}

		.detail-panel h3 {
			font-size: 24px;
		}
	}
</style>
