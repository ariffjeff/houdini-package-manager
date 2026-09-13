<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		Check,
		ChevronRight,
		FileCog,
		GitBranch,
		Globe,
		GlobeOff,
		FolderCode,
		RefreshCw,
		Square,
		Tag,
		TriangleAlert,
		CloudSync,
		HardDriveDownload,
		X,
		Cog
	} from '@lucide/svelte';
	import ActivationMap from '$lib/activation-map/ActivationMap.svelte';
	import ActivationTable from '$lib/activation-map/ActivationTable.svelte';
	import {
		createActivationGraph,
		isOfficialPlugin,
		isTargetIssue,
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
	type IssueItem = {
		pluginId: string;
		nodeId: string;
		label: string;
		packageFile: string;
		statuses: ActivationTarget['status'][];
		installs: string[];
		notes: string[];
	};
	type TargetIssueDetails = {
		installId: string;
		installLabel: string;
		packageFile: string;
		target: ActivationTarget;
		summary: string;
		message: string;
	};
	type TooltipState = {
		text: string;
		left: number;
		top: number;
		placement: 'above' | 'below';
	};
	type TargetConfigEditor = {
		installId: string;
		installLabel: string;
		packagePath: string;
		config: Record<string, unknown>;
		hpath: string;
		migrateLegacyPath: boolean;
		state: 'loading' | 'ready' | 'saving' | 'saved' | 'error';
		message: string;
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
	let installVersion = $state('');
	let installDialogOpen = $state(false);
	let selectedInstallIds = $state<string[]>([]);
	let installDestinationChoice = $state('custom');
	let installCustomDestination = $state('');
	let openInstalledFolder = $state(false);
	let openInstalledConfig = $state(false);
	let installState = $state<'idle' | 'working' | 'success' | 'error'>('idle');
	let installMessage = $state('');
	let installController: AbortController | null = null;
	let gitSyncState = $state<ActionState>('idle');
	let gitSyncMessage = $state('');
	let pluginScanState = $state<ActionState>('idle');
	let pluginActionState = $state<ActionState>('idle');
	let issuesDialogOpen = $state(false);
	let targetIssueDetails = $state<TargetIssueDetails | null>(null);
	let targetConfigEditor = $state<TargetConfigEditor | null>(null);
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
	let issueItems = $derived.by<IssueItem[]>(() => {
		const issueGroups: Array<{ pluginId: string; targets: ActivationTarget[] }> = [];
		for (const target of activationTargets) {
			if (!isTargetIssue(target)) continue;
			const group = issueGroups.find((item) => item.pluginId === target.pluginId);
			if (group) {
				group.targets.push(target);
				continue;
			}
			issueGroups.push({ pluginId: target.pluginId, targets: [target] });
		}

		return issueGroups
			.map(({ pluginId, targets }) => {
				const plugin = activationPlugins.find((item) => item.id === pluginId);
				const statuses = [...new Set(targets.map((target) => target.status))];
				const installs = [
					...new Set(
						targets.map(
							(target) =>
								activationInstalls.find((install) => install.id === target.installId)?.label ??
								target.installId
						)
					)
				];
				const notes = [...new Set(targets.map((target) => target.note).filter(Boolean))];

				return {
					pluginId,
					nodeId: plugin && isOfficialPlugin(plugin) ? OFFICIAL_NODE_ID : `plugin:${pluginId}`,
					label: plugin?.name ?? pluginId,
					packageFile: plugin?.packageFile ?? targets[0].packageFile,
					statuses,
					installs,
					notes
				};
			})
			.sort((left, right) => left.label.localeCompare(right.label));
	});
	let attentionCount = $derived(issueItems.length);
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
	let selectedPluginGitSource = $derived(
		selectedPlugin?.sources?.find((source) => source.exists && source.versionSource === 'git')
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
	let requestedInstallDestination = $derived(
		installDestinationChoice === 'custom'
			? installCustomDestination.trim()
			: installDestinationChoice
	);
	let selectedInstallSummary = $derived(
		selectedInstallIds.length === activationInstalls.length
			? 'All detected Houdini installs'
			: `${selectedInstallIds.length} of ${activationInstalls.length} Houdini installs`
	);
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

		const groups: PluginTargetGroup[] = [];
		for (const install of activationInstalls) {
			const target = targetFor(activationTargets, plugin.id, install.id);
			if (!target?.packagePath) continue;

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
	let targetConfigPreview = $derived.by(() => {
		const editor = targetConfigEditor;
		if (!editor) return '{}';

		const preview = { ...editor.config };
		if (editor.migrateLegacyPath) delete preview.path;
		preview.hpath = editor.hpath.trim();
		return JSON.stringify(preview, null, 2);
	});

	function installBuildLabels(installs: HoudiniInstall[]): string[] {
		return [...new Set(installs.map((install) => install.build))];
	}

	function compactPath(value: string): string {
		const segments = value.split(/[\\/]+/).filter(Boolean);
		if (segments.length <= 3) return value;

		const separator = value.includes('\\') ? '\\' : '/';
		const prefix = /^[A-Za-z]:[\\/]/.test(value) ? `${segments[0]}${separator}` : '';
		const tail = segments.slice(-2).join(separator);
		return `${prefix}...${separator}${tail}`;
	}

	function configHpath(config: Record<string, unknown>, fallback = ''): string {
		if (typeof config.hpath === 'string') return config.hpath;
		if (Array.isArray(config.hpath)) {
			return config.hpath.filter((value): value is string => typeof value === 'string').join('; ');
		}
		if (typeof config.path === 'string') return config.path;
		if (Array.isArray(config.path)) {
			return config.path.filter((value): value is string => typeof value === 'string').join('; ');
		}
		return fallback;
	}

	function isInvalidPackageJson(target: ActivationTarget): boolean {
		return target.status === 'warning' && target.note.startsWith('Invalid package JSON:');
	}

	function targetIssueSummary(target: ActivationTarget): string {
		if (target.usesLegacyPath && ['enabled', 'disabled'].includes(target.status)) {
			return 'Deprecated path key';
		}
		if (target.status === 'missing') return 'Plugin source not found';
		if (isInvalidPackageJson(target)) return 'Invalid package JSON';
		if (target.status === 'incompatible') return 'Plugin is incompatible';
		return 'Package config needs review';
	}

	function openTargetIssueDetails(install: HoudiniInstall, target: ActivationTarget) {
		targetIssueDetails = {
			installId: install.id,
			installLabel: install.label,
			packageFile: target.packageFile,
			target,
			summary: targetIssueSummary(target),
			message:
				target.note ||
				(target.status === 'missing'
					? 'The package config does not resolve to an available plugin source.'
					: 'The package config could not be activated for this Houdini install.')
		};
	}

	function closeTargetIssueDetails() {
		targetIssueDetails = null;
	}

	async function openTargetConfigDialog(install: HoudiniInstall, target: ActivationTarget) {
		const plugin = selectedPlugin;
		if (!plugin || !target.packagePath || isScanActive || pluginActionState === 'working') return;

		targetConfigEditor = {
			installId: install.id,
			installLabel: install.label,
			packagePath: target.packagePath,
			config: {},
			hpath: target.sourcePaths?.[0] ?? '',
			migrateLegacyPath: target.usesLegacyPath ?? false,
			state: 'loading',
			message: ''
		};

		try {
			const result = await runHoudiniPluginAction({
				pluginId: plugin.id,
				action: 'get-config',
				installId: install.id
			});
			if (!targetConfigEditor || targetConfigEditor.installId !== install.id) return;
			const config = result.config ?? {};
			targetConfigEditor.config = config;
			targetConfigEditor.hpath = configHpath(config, target.sourcePaths?.[0] ?? '');
			targetConfigEditor.migrateLegacyPath = false;
			targetConfigEditor.state = 'ready';
		} catch (error) {
			if (!targetConfigEditor || targetConfigEditor.installId !== install.id) return;
			targetConfigEditor.state = 'error';
			targetConfigEditor.message = getErrorMessage(error);
		}
	}

	function closeTargetConfigDialog() {
		if (targetConfigEditor?.state === 'saving') return;
		targetConfigEditor = null;
	}

	async function saveTargetConfig() {
		const plugin = selectedPlugin;
		const editor = targetConfigEditor;
		if (!plugin || !editor || !editor.hpath.trim() || editor.state === 'saving') return;

		editor.state = 'saving';
		editor.message = '';
		try {
			const result = await runHoudiniPluginAction({
				pluginId: plugin.id,
				action: 'update-config',
				installId: editor.installId,
				hpath: editor.hpath,
				migrateLegacyPath: editor.migrateLegacyPath
			});
			if (result.discovery) applyDiscovery(result.discovery, 'plugins');
			const config = { ...editor.config };
			if (editor.migrateLegacyPath) delete config.path;
			config.hpath = editor.hpath.trim();
			editor.config = config;
			editor.hpath = editor.hpath.trim();
			editor.state = 'saved';
			editor.message = result.message;
		} catch (error) {
			editor.state = 'error';
			editor.message = getErrorMessage(error);
		}
	}

	function installedVersionLabel(plugin: PluginRecord): string {
		const installedVersions = plugin.installedVersions ?? [];
		if (installedVersions.length > 1) return `${installedVersions.length} versions installed`;
		if (installedVersions.length === 1) return installedVersions[0];
		return 'No version';
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
		installVersion = '';
		installState = 'idle';
		installMessage = '';
		gitSyncState = 'idle';
		gitSyncMessage = '';
		pluginScanState = 'idle';
		pluginActionState = 'idle';
	}

	function openIssuesDialog() {
		if (issueItems.length) issuesDialogOpen = true;
	}

	function closeIssuesDialog() {
		issuesDialogOpen = false;
	}

	function selectIssue(issue: IssueItem) {
		view = 'map';
		searchQuery = '';
		closeIssuesDialog();
		focusNodeId = issue.nodeId;
		selectNode(issue.nodeId);
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

		installVersion = selectedPluginVersions.includes(installVersion)
			? installVersion
			: selectedPluginVersions[0];
		selectedInstallIds = activationInstalls.map((install) => install.id);
		const existingSource = remoteSourceOptions[0];
		installDestinationChoice = existingSource ?? 'custom';
		installCustomDestination = existingSource ?? '';
		openInstalledFolder = false;
		openInstalledConfig = false;
		installState = 'idle';
		installMessage = '';
		installDialogOpen = true;
	}

	function closeInstallDialog() {
		if (installState === 'working') return;
		installDialogOpen = false;
	}

	function toggleInstallTarget(installId: string, checked: boolean) {
		selectedInstallIds = checked
			? [...new Set([...selectedInstallIds, installId])]
			: selectedInstallIds.filter((id) => id !== installId);
	}

	function setAllInstallTargets(selected: boolean) {
		selectedInstallIds = selected ? activationInstalls.map((install) => install.id) : [];
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		if (issuesDialogOpen) closeIssuesDialog();
		if (targetIssueDetails) closeTargetIssueDetails();
		if (targetConfigEditor && targetConfigEditor.state !== 'saving') closeTargetConfigDialog();
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

	async function runSelectedPluginAction(
		request:
			| { action: 'open-config' | 'open-package-folder'; installId: string }
			| { action: 'open-source'; sourcePath: string }
			| { action: 'set-enabled'; installId: string; enabled: boolean }
	) {
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

	function stopActionPropagation(event: MouseEvent) {
		event.stopPropagation();
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

	async function installSelectedPlugin() {
		const plugin = selectedPlugin;
		const destinationPath = requestedInstallDestination;
		if (
			!plugin ||
			!requestedInstallVersion ||
			!selectedPluginVersions.includes(requestedInstallVersion) ||
			!selectedInstallIds.length ||
			!destinationPath
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
					installIds: [...selectedInstallIds],
					destinationPath
				},
				controller.signal
			);
			applyDiscovery(result.discovery, 'all');
			installState = 'success';
			const postInstallMessages = [result.message];
			installDialogOpen = false;
			if (openInstalledFolder) {
				try {
					await runHoudiniPluginAction({
						pluginId: plugin.id,
						action: 'open-source',
						sourcePath: destinationPath
					});
				} catch (error) {
					postInstallMessages.push(getErrorMessage(error));
				}
			}
			if (openInstalledConfig) {
				try {
					await runHoudiniPluginAction({
						pluginId: plugin.id,
						action: 'open-config',
						installId: selectedInstallIds[0]
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
					<div><strong>{pluginCount}</strong><span>user plugins</span></div>
					<div><strong>{activationInstalls.length}</strong><span>Houdinis</span></div>
					<button
						type="button"
						class="attention-stat issue-stat"
						aria-haspopup="dialog"
						aria-expanded={issuesDialogOpen}
						disabled={!issueItems.length}
						onclick={openIssuesDialog}
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
					<aside class="detail-panel" aria-live="polite">
						{#if selectedPlugin}
							<p class="section-kicker">Plugin metadata</p>
							<div class="plugin-header">
								<h3>{selectedPlugin.name}</h3>
								{#if selectedPlugin.author}
									<span class="node-author">{selectedPlugin.author}</span>
								{/if}
							</div>
							<div class="detail-meta">
								<button
									type="button"
									class="detail-meta-item node-action-button icon-action-button plugin-rescan-button"
									aria-label={pluginScanState === 'working'
										? 'Rescanning plugin configs'
										: 'Rescan plugin configs'}
									data-tooltip={pluginScanState === 'working'
										? 'Rescanning plugin configs'
										: 'Rescan plugin configs'}
									disabled={isScanActive || pluginScanState === 'working'}
									onclick={(event) => {
										stopActionPropagation(event);
										void rescanSelectedPluginConfigs();
									}}
								>
									<RefreshCw size={18} strokeWidth={1.8} aria-hidden="true" />
								</button>
								{#if selectedPlugin.repositoryUrl}
									<a
										class="detail-meta-item detail-meta-link"
										href={selectedPlugin.repositoryUrl}
										target="_blank"
										rel="external noopener noreferrer"
										aria-label="Open remote repository"
										data-tooltip="Open remote repository"
									>
										<Globe
											class="detail-meta-icon"
											size={22}
											strokeWidth={1.8}
											aria-hidden="true"
										/>
									</a>
								{:else}
									<span
										class="detail-meta-item"
										class:is-negative={true}
										role="img"
										aria-label="No remote repository"
										data-tooltip="No remote repository"
									>
										<GlobeOff
											class="detail-meta-icon"
											size={22}
											strokeWidth={1.8}
											aria-hidden="true"
										/>
									</span>
								{/if}
								<span
									class="detail-meta-item version-control-meta"
									class:is-negative={!selectedPluginGitSource}
									role="img"
									aria-label={selectedPluginGitSource
										? `Version controlled${selectedPluginGitSource.gitBranch ? `, ${selectedPluginGitSource.gitBranch}` : ''}: ${installedVersionLabel(selectedPlugin)} branch`
										: 'No version control'}
									data-tooltip={selectedPluginGitSource
										? selectedPluginGitSource.gitBranch
											? `Version controlled, ${selectedPluginGitSource.gitBranch} branch`
											: 'Version controlled'
										: 'No version control'}
								>
									<GitBranch
										class="detail-meta-icon"
										size={22}
										strokeWidth={1.8}
										aria-hidden="true"
									/>
									{#if selectedPluginGitSource && selectedPlugin.installedVersions?.length}
										<span class="detail-meta-version-box">
											{#if selectedPluginGitSource.gitTag}
												<Tag size={13} strokeWidth={2} aria-hidden="true" />
											{/if}
											<strong class="detail-meta-version"
												>{installedVersionLabel(selectedPlugin)}</strong
											>
										</span>
									{/if}
									{#if selectedPluginGitSource?.gitBranch}
										<span class="detail-meta-branch">{selectedPluginGitSource.gitBranch}</span>
									{/if}
								</span>
							</div>
							{#if selectedPlugin.sources?.some((source) => source.exists)}
								<section class="panel-section source-list" aria-labelledby="local-sources-title">
									<div class="panel-section-heading">
										<div>
											<h4 id="local-sources-title">Local Sources</h4>
											<p>Valid sources derived from package configs</p>
										</div>
										<strong class="panel-section-count"
											>{selectedPlugin.sources.filter((source) => source.exists).length}</strong
										>
									</div>
									<div class="target-list">
										{#each selectedPlugin.sources as source (source.path)}
											{#if source.exists}
												<div class="target-item target-item-actions source-item">
													<div class="target-actions">
														<div
															class="node-action-row"
															aria-label={`${source.version ?? 'Source'} plugin actions`}
														>
															<button
																type="button"
																class="node-action-button icon-action-button"
																aria-label={`Open plugin folder for ${selectedPlugin.name} at ${source.path}`}
																data-tooltip="Open plugin folder"
																disabled={isScanActive || pluginActionState === 'working'}
																onclick={(event) => {
																	stopActionPropagation(event);
																	void runSelectedPluginAction({
																		action: 'open-source',
																		sourcePath: source.path
																	});
																}}
															>
																<FolderCode
																	class="detail-meta-icon"
																	size={22}
																	strokeWidth={1.8}
																	aria-hidden="true"
																/>
															</button>
														</div>
													</div>
													<div>
														<strong>{source.version ?? 'Unversioned source'}</strong>
														<small>{source.path}</small>
													</div>
												</div>
											{/if}
										{/each}
									</div>
								</section>
							{/if}
							{#if selectedPlugin.repositoryUrl || selectedPluginVersions.length || installMessage}
								<div class="panel-section plugin-actions">
									<div class="panel-section-heading remote-source-heading m-0">
										<div>
											<h4 id="remote-sources-title">Remote Source</h4>
											<p>Derived from /.git</p>
										</div>
									</div>
									<div class="remote-source-block">
										<div class="remote-source-actions">
											{#if selectedPlugin.repositoryUrl}
												<button
													type="button"
													class="sync-button"
													aria-label="Sync Git"
													disabled={isScanActive || gitSyncState === 'working'}
													data-tooltip="Sync git metadata"
													onclick={(event) => {
														stopActionPropagation(event);
														void syncSelectedPluginGit();
													}}
												>
													<CloudSync
														class="detail-meta-icon"
														size={22}
														strokeWidth={1.8}
														aria-hidden="true"
													/>
												</button>
												<a
													class="source-button"
													href={selectedPlugin.repositoryUrl}
													aria-label="Open source"
													target="_blank"
													rel="external noopener noreferrer"
													data-tooltip="Open remote repository"
												>
													<Globe
														class="detail-meta-icon"
														size={22}
														strokeWidth={1.8}
														aria-hidden="true"
													/>
												</a>
											{/if}
											{#if selectedPluginVersions.length}
												{#if !selectedPlugin.installedVersions?.includes(selectedPluginVersions[0])}
													<span class="new-version-note">
														New:
														{#if selectedPluginGitSource?.availableVersions?.includes(selectedPluginVersions[0])}
															<Tag size={13} strokeWidth={2} aria-hidden="true" />
														{/if}
														<span>{selectedPluginVersions[0]}</span>
													</span>
												{/if}
												<button
													type="button"
													class="install-button"
													aria-label={`Configure remote install for ${selectedPlugin.name}`}
													disabled={installState === 'working'}
													onclick={openInstallDialog}
													data-tooltip="Choose install options"
												>
													<HardDriveDownload class="install-icon" />
													<Cog class="install-icon" />
												</button>
											{/if}
										</div>
										{#if gitSyncMessage}
											<p class={['git-sync-message', `is-${gitSyncState}`]} aria-live="polite">
												{gitSyncMessage}
											</p>
										{/if}
									</div>
									{#if installMessage}
										<p class={['install-message', `is-${installState}`]} aria-live="polite">
											{installMessage}
										</p>
									{/if}
								</div>
							{/if}
							<section class="panel-section target-section" aria-labelledby="target-installs-title">
								<div class="panel-section-heading">
									<div>
										<h4 id="target-installs-title">Target installs</h4>
										<p>Package status by Houdini version</p>
									</div>
									<strong class="panel-section-count">{selectedPluginTargetGroups.length}</strong>
								</div>
								<div class="target-list">
									{#each selectedPluginTargetGroups as group (group.representativeInstall.version)}
										{@const install = group.representativeInstall}
										{@const target = group.target}
										{@const sourcePaths = target.sourcePaths ?? []}
										<div
											class={['target-item', 'target-item-actions', `target-item-${target.status}`]}
										>
											<div class="target-actions target-primary-actions">
												<div
													class="node-action-row"
													aria-label={`${install.label} primary actions`}
												>
													<button
														type="button"
														class={[
															'node-action-button',
															'toggle-action',
															target.status === 'enabled' ? 'is-enabled' : 'is-disabled',
															['warning', 'incompatible', 'missing'].includes(target.status)
																? 'is-config-error'
																: ''
														]}
														aria-label={`${target.status === 'enabled' ? 'Disable' : 'Enable'} plugin for ${install.label}`}
														data-tooltip={`${target.status === 'enabled' ? 'Disable' : 'Enable'} plugin`}
														disabled={isScanActive ||
															pluginActionState === 'working' ||
															['warning', 'incompatible', 'missing'].includes(target.status)}
														onclick={(event) => {
															stopActionPropagation(event);
															void runSelectedPluginAction({
																action: 'set-enabled',
																installId: install.id,
																enabled: target.status !== 'enabled'
															});
														}}
													>
														{#if target.status === 'enabled'}
															<Check
																class="action-icon"
																size={18}
																strokeWidth={2.2}
																aria-hidden="true"
															/>
														{:else}
															<Square
																class="action-icon"
																size={18}
																strokeWidth={2.2}
																aria-hidden="true"
															/>
														{/if}
													</button>
													<button
														type="button"
														class={[
															'node-action-button',
															'icon-action-button',
															target.usesLegacyPath ||
															['warning', 'incompatible', 'missing'].includes(target.status)
																? 'issue-config-button'
																: ''
														]}
														aria-label={`Open JSON config for ${install.label}`}
														data-tooltip="Open JSON config"
														disabled={isScanActive || pluginActionState === 'working'}
														onclick={(event) => {
															stopActionPropagation(event);
															void runSelectedPluginAction({
																action: 'open-config',
																installId: install.id
															});
														}}
													>
														<FileCog size={22} strokeWidth={1.8} aria-hidden="true" />
													</button>
													<button
														type="button"
														class="node-action-button icon-action-button"
														class:issue-config-button={target.usesLegacyPath}
														aria-label={`Edit config options for ${install.label}`}
														data-tooltip={target.usesLegacyPath
															? 'Migrate deprecated path key'
															: 'Edit config options'}
														disabled={isScanActive || pluginActionState === 'working'}
														onclick={(event) => {
															stopActionPropagation(event);
															void openTargetConfigDialog(install, target);
														}}
													>
														<Cog size={22} strokeWidth={1.8} aria-hidden="true" />
													</button>
													<button
														type="button"
														class="node-action-button icon-action-button"
														aria-label={`Open packages folder for ${install.label}`}
														data-tooltip="Open packages folder"
														disabled={isScanActive || pluginActionState === 'working'}
														onclick={(event) => {
															stopActionPropagation(event);
															void runSelectedPluginAction({
																action: 'open-package-folder',
																installId: install.id
															});
														}}
													>
														<FolderCode
															class="detail-meta-icon"
															size={22}
															strokeWidth={1.8}
															aria-hidden="true"
														/>
													</button>
												</div>
											</div>
											<div class="target-install-label">
												<strong>{install.label}</strong>
												<small
													class="target-plugin-location"
													title={sourcePaths.join('\n') || 'No plugin source configured'}
												>
													{sourcePaths.length
														? `${compactPath(sourcePaths[0])}${sourcePaths.length > 1 ? ` + ${sourcePaths.length - 1} more` : ''}`
														: 'No plugin source configured'}
												</small>
												<div class="target-builds" aria-label="Install builds">
													{#each installBuildLabels(group.installs) as build (build)}
														<span data-tooltip={`Build ${build}`}>{build}</span>
													{/each}
												</div>
											</div>
											<div class="target-actions target-status-actions">
												{#if ['warning', 'incompatible', 'missing'].includes(target.status)}
													<button
														type="button"
														class="missing-source-warning target-missing-source-warning"
														aria-label={`View ${targetIssueSummary(target)} for ${install.label}`}
														data-tooltip="View issue details"
														disabled={isScanActive || pluginActionState === 'working'}
														onclick={(event) => {
															stopActionPropagation(event);
															openTargetIssueDetails(install, target);
														}}
													>
														<TriangleAlert size={18} strokeWidth={1.9} aria-hidden="true" />
														<div>
															<strong>{targetIssueSummary(target)}</strong>
															<small>View issue details</small>
														</div>
													</button>
												{/if}
												<div class="node-action-row" aria-label={`${install.label} plugin actions`}>
													{#if ['warning', 'incompatible', 'missing'].includes(target.status)}
														<button
															type="button"
															class="node-action-button icon-action-button issue-refresh-button"
															aria-label={`Rescan config for ${install.label}`}
															data-tooltip="Rescan config"
															disabled={isScanActive || pluginScanState === 'working'}
															onclick={(event) => {
																stopActionPropagation(event);
																void rescanSelectedPluginConfigs();
															}}
														>
															<RefreshCw size={18} strokeWidth={1.9} aria-hidden="true" />
														</button>
													{/if}
												</div>
											</div>
										</div>
									{/each}
								</div>
							</section>
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
	{#if installDialogOpen && selectedPlugin}
		<div class="issues-dialog-backdrop install-dialog-backdrop">
			<button
				type="button"
				class="issues-dialog-dismiss"
				aria-label="Close install configuration dialog"
				onclick={closeInstallDialog}
			></button>
			<dialog open class="issues-dialog install-dialog" aria-labelledby="install-dialog-title">
				<div class="issues-dialog-header">
					<div>
						<h2 id="install-dialog-title">Install {selectedPlugin.name}</h2>
						<p>Choose where the remote checkout lives and which Houdini installs use it.</p>
					</div>
					<button
						type="button"
						class="dialog-close-button"
						aria-label="Close install configuration dialog"
						disabled={installState === 'working'}
						onclick={closeInstallDialog}
					>
						<X size={18} strokeWidth={1.8} aria-hidden="true" />
					</button>
				</div>
				<div class="install-dialog-content">
					<label class="install-dialog-field">
						<span>Version</span>
						<select bind:value={installVersion} disabled={installState === 'working'}>
							{#each selectedPluginVersions as version (version)}
								<option value={version}>{version}</option>
							{/each}
						</select>
					</label>

					<fieldset class="install-dialog-fieldset">
						<div class="install-fieldset-heading">
							<div>
								<legend>Houdini installs</legend>
							</div>
							<div class="install-selection-actions">
								<button
									type="button"
									class="selection-link"
									disabled={installState === 'working'}
									onclick={() => setAllInstallTargets(true)}>All</button
								>
								<button
									type="button"
									class="selection-link"
									disabled={installState === 'working'}
									onclick={() => setAllInstallTargets(false)}>Clear</button
								>
							</div>
						</div>
						<div class="install-target-options">
							{#each activationInstalls as install (install.id)}
								<label class="install-target-option">
									<input
										type="checkbox"
										checked={selectedInstallIds.includes(install.id)}
										disabled={installState === 'working'}
										onchange={(event) =>
											toggleInstallTarget(
												install.id,
												(event.currentTarget as HTMLInputElement).checked
											)}
									/>
									<span>
										<strong>{install.label}</strong>
										<small>{install.platform} / {install.build}</small>
									</span>
								</label>
							{/each}
						</div>
					</fieldset>

					<fieldset class="install-dialog-fieldset">
						<legend>Plugin destination</legend>
						<p>Git will clone or update the remote source at this exact folder.</p>
						{#each remoteSourceOptions as sourcePath (sourcePath)}
							<label class="install-destination-option">
								<input
									type="radio"
									name="install-destination"
									checked={installDestinationChoice === sourcePath}
									disabled={installState === 'working'}
									onchange={() => (installDestinationChoice = sourcePath)}
								/>
								<span>
									<strong
										>{sourcePath === hpmPluginDestination
											? 'Use HPM plugin folder'
											: 'Use discovered source'}</strong
									>
									<small>{sourcePath}</small>
								</span>
							</label>
						{/each}
						<label class="install-destination-option">
							<input
								type="radio"
								name="install-destination"
								checked={installDestinationChoice === 'custom'}
								disabled={installState === 'working'}
								onchange={() => (installDestinationChoice = 'custom')}
							/>
							<span>
								<strong>Use a custom folder</strong>
								<small>Enter the full path for the plugin checkout.</small>
							</span>
						</label>
						<input
							class="install-destination-input"
							type="text"
							aria-label="Custom plugin destination"
							value={installCustomDestination}
							placeholder="C:\\Plugins\\{selectedPlugin.name}"
							disabled={installDestinationChoice !== 'custom' || installState === 'working'}
							oninput={(event) =>
								(installCustomDestination = (event.currentTarget as HTMLInputElement).value)}
						/>
					</fieldset>

					<fieldset class="install-dialog-fieldset">
						<legend>After install</legend>
						<p>Choose which installed plugin locations to open when setup finishes.</p>
						<label class="install-open-folder-option">
							<input
								type="checkbox"
								bind:checked={openInstalledFolder}
								disabled={installState === 'working'}
							/>
							<span>
								<strong>Open plugin folder</strong>
							</span>
						</label>
						<label class="install-open-folder-option">
							<input
								type="checkbox"
								bind:checked={openInstalledConfig}
								disabled={installState === 'working'}
							/>
							<span>
								<strong>Open plugin config</strong>
							</span>
						</label>
					</fieldset>

					<div class="install-review">
						<div>
							<span>Install plan</span>
							<strong>{requestedInstallVersion} / {selectedInstallSummary}</strong>
						</div>
						<code>{requestedInstallDestination || 'Choose a destination folder'}</code>
					</div>
					{#if installMessage}
						<p class={['install-message', `is-${installState}`]} aria-live="polite">
							{installMessage}
						</p>
					{/if}
				</div>
				<div class="target-issue-actions install-dialog-actions">
					{#if installState === 'working'}
						<button type="button" class="dialog-secondary-button" onclick={cancelInstall}>
							Cancel installation
						</button>
					{:else}
						<button type="button" class="dialog-secondary-button" onclick={closeInstallDialog}>
							Close
						</button>
					{/if}
					<button
						type="button"
						class="dialog-primary-button"
						disabled={installState === 'working' ||
							!requestedInstallVersion ||
							!selectedInstallIds.length ||
							!requestedInstallDestination}
						onclick={() => void installSelectedPlugin()}
					>
						Install plugin
					</button>
				</div>
			</dialog>
		</div>
	{/if}
	{#if issuesDialogOpen}
		<div class="issues-dialog-backdrop">
			<button
				type="button"
				class="issues-dialog-dismiss"
				aria-label="Close issues dialog"
				onclick={closeIssuesDialog}
			></button>
			<dialog open class="issues-dialog" aria-labelledby="issues-dialog-title">
				<div class="issues-dialog-header">
					<div>
						<h2 id="issues-dialog-title">Issues</h2>
						<p>{issueItems.length} config issues across the workspace</p>
					</div>
					<button
						type="button"
						class="dialog-close-button"
						aria-label="Close issues dialog"
						onclick={closeIssuesDialog}
					>
						<X size={18} strokeWidth={1.8} aria-hidden="true" />
					</button>
				</div>
				<div class="issue-list">
					{#each issueItems as issue (issue.pluginId)}
						<button
							type="button"
							class="issue-list-item"
							aria-label={`Open ${issue.label} issue details`}
							onclick={() => selectIssue(issue)}
						>
							<span
								class={['issue-status-marker', `status-${issue.statuses[0]}`]}
								aria-hidden="true"
							></span>
							<span class="issue-list-copy">
								<strong>{issue.label}</strong>
								<small>{issue.packageFile} / {issue.statuses.map(statusLabel).join(' / ')}</small>
								<small>Affects: {issue.installs.join(', ')}</small>
								{#if issue.notes.length}
									<small class="issue-list-note">{issue.notes.join(' / ')}</small>
								{/if}
							</span>
							<ChevronRight size={18} strokeWidth={1.8} aria-hidden="true" />
						</button>
					{/each}
				</div>
			</dialog>
		</div>
	{/if}
	{#if targetConfigEditor && selectedPlugin}
		<div class="issues-dialog-backdrop">
			<button
				type="button"
				class="issues-dialog-dismiss"
				aria-label="Close config options dialog"
				disabled={targetConfigEditor.state === 'saving'}
				onclick={closeTargetConfigDialog}
			></button>
			<dialog open class="issues-dialog target-config-dialog" aria-labelledby="target-config-title">
				<div class="issues-dialog-header">
					<div>
						<h2 id="target-config-title">Config options</h2>
						<p>{selectedPlugin.name} / {targetConfigEditor.installLabel}</p>
					</div>
					<button
						type="button"
						class="dialog-close-button"
						aria-label="Close config options dialog"
						disabled={targetConfigEditor.state === 'saving'}
						onclick={closeTargetConfigDialog}
					>
						<X size={18} strokeWidth={1.8} aria-hidden="true" />
					</button>
				</div>
				<div class="target-config-content">
					<label class="install-dialog-field">
						<span>Local plugin source</span>
						<input
							class="config-source-input"
							type="text"
							bind:value={targetConfigEditor.hpath}
							disabled={targetConfigEditor.state === 'loading' ||
								targetConfigEditor.state === 'saving'}
							placeholder="C:\\Plugins\\{selectedPlugin.name}"
						/>
					</label>
					{#if targetConfigEditor.config.path !== undefined}
						<p class="config-legacy-warning" role="alert">
							This config uses the deprecated <code>path</code> key. Use <code>hpath</code> instead.
						</p>
						<label class="config-migration-toggle">
							<input
								type="checkbox"
								bind:checked={targetConfigEditor.migrateLegacyPath}
								disabled={targetConfigEditor.state === 'saving'}
							/>
							<span
								>Auto-remove <code>path</code> and replace it with <code>hpath</code> on save</span
							>
						</label>
					{/if}
					<div class="config-preview-panel">
						<div class="config-preview-heading">
							<span>Live JSON preview</span>
							<code>{targetConfigEditor.packagePath}</code>
						</div>
						<pre>{targetConfigEditor.state === 'loading'
								? 'Loading config...'
								: targetConfigPreview}</pre>
					</div>
					{#if targetConfigEditor.message}
						<p
							class={[
								'install-message',
								`is-${targetConfigEditor.state === 'error' ? 'error' : 'success'}`
							]}
							aria-live="polite"
						>
							{targetConfigEditor.message}
						</p>
					{/if}
				</div>
				<div class="target-issue-actions">
					<button
						type="button"
						class="dialog-secondary-button"
						disabled={targetConfigEditor.state === 'saving'}
						onclick={closeTargetConfigDialog}
					>
						Close
					</button>
					<button
						type="button"
						class="dialog-primary-button"
						disabled={targetConfigEditor.state === 'loading' ||
							targetConfigEditor.state === 'saving' ||
							!targetConfigEditor.hpath.trim()}
						onclick={() => void saveTargetConfig()}
					>
						{targetConfigEditor.state === 'saving' ? 'Saving...' : 'Save config'}
					</button>
				</div>
			</dialog>
		</div>
	{/if}
	{#if targetIssueDetails}
		<div class="issues-dialog-backdrop">
			<button
				type="button"
				class="issues-dialog-dismiss"
				aria-label="Close target issue dialog"
				onclick={closeTargetIssueDetails}
			></button>
			<dialog open class="issues-dialog target-issue-dialog" aria-labelledby="target-issue-title">
				<div class="issues-dialog-header">
					<div>
						<h2 id="target-issue-title">{targetIssueDetails.summary}</h2>
						<p>{targetIssueDetails.installLabel} / {targetIssueDetails.packageFile}</p>
					</div>
					<button
						type="button"
						class="dialog-close-button"
						aria-label="Close target issue dialog"
						onclick={closeTargetIssueDetails}
					>
						<X size={18} strokeWidth={1.8} aria-hidden="true" />
					</button>
				</div>
				<p class="target-issue-message">{targetIssueDetails.message}</p>
				<div class="target-issue-actions">
					<button type="button" class="dialog-secondary-button" onclick={closeTargetIssueDetails}>
						Close
					</button>
					<button
						type="button"
						class="dialog-secondary-button"
						disabled={isScanActive || pluginActionState === 'working'}
						onclick={() => {
							const issue = targetIssueDetails;
							const install = issue
								? activationInstalls.find((candidate) => candidate.id === issue.installId)
								: undefined;
							if (!issue || !install) return;
							closeTargetIssueDetails();
							void openTargetConfigDialog(install, issue.target);
						}}
					>
						Edit config options
					</button>
					<button
						type="button"
						class="dialog-primary-button"
						disabled={isScanActive || pluginActionState === 'working'}
						onclick={() => {
							const issue = targetIssueDetails;
							if (!issue) return;
							closeTargetIssueDetails();
							void runSelectedPluginAction({ action: 'open-config', installId: issue.installId });
						}}
					>
						Open config
					</button>
				</div>
			</dialog>
		</div>
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

	.intro-stats div,
	.intro-stats button {
		min-width: 82px;
		padding-left: 14px;
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

	.detail-panel {
		position: relative;
		z-index: 2;
		min-height: 0;
		overflow-y: auto;
		padding: 0 24px;
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

	.issues-dialog-backdrop {
		position: fixed;
		inset: 0;
		z-index: 9000;
		display: grid;
		place-items: center;
		padding: 24px;
		background: rgba(9, 14, 15, 0.72);
	}

	.issues-dialog-dismiss {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
		background: transparent;
		cursor: default;
	}

	.issues-dialog {
		position: relative;
		z-index: 1;
		display: flex;
		width: min(640px, 100%);
		max-height: min(900px, calc(100dvh - 48px));
		flex-direction: column;
		overflow: hidden;
		padding: 22px;
		border: 1px solid var(--line-strong);
		border-radius: 8px;
		background: #182224;
		box-shadow: 0 22px 70px rgba(0, 0, 0, 0.42);
	}

	.issues-dialog-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 20px;
	}

	.issues-dialog-header h2 {
		margin: 0;
		font-size: 22px;
		font-weight: 600;
	}

	.issues-dialog-header p:last-child {
		margin: 7px 0 0;
		color: var(--text-muted);
		font-size: 12px;
	}

	.dialog-close-button {
		display: inline-flex;
		width: 34px;
		height: 34px;
		align-items: center;
		justify-content: center;
		flex: 0 0 auto;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
	}

	.dialog-close-button:hover,
	.dialog-close-button:focus-visible {
		border-color: #df6d58;
		color: #ffb09f;
		outline: none;
	}

	.issue-list {
		display: flex;
		min-height: 0;
		flex-direction: column;
		gap: 8px;
		overflow-y: auto;
		padding-top: 16px;
	}

	.issue-list-item {
		display: grid;
		grid-template-columns: 9px minmax(0, 1fr) auto;
		align-items: start;
		gap: 12px;
		width: 100%;
		padding: 12px;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: rgba(255, 255, 255, 0.025);
		color: var(--text);
		cursor: pointer;
		font: inherit;
		text-align: left;
	}

	.issue-list-item:hover,
	.issue-list-item:focus-visible {
		border-color: rgba(223, 109, 88, 0.7);
		background: rgba(223, 109, 88, 0.09);
		outline: none;
	}

	.issue-status-marker {
		width: 9px;
		height: 9px;
		margin-top: 4px;
		border-radius: 50%;
		background: #d39b38;
	}

	.issue-status-marker.status-incompatible,
	.issue-status-marker.status-missing {
		background: #df6d58;
	}

	.issue-list-copy {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 4px;
	}

	.issue-list-copy strong {
		font-size: 13px;
		font-weight: 600;
	}

	.issue-list-copy small {
		color: var(--text-muted);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
		line-height: 1.4;
		overflow-wrap: anywhere;
	}

	.issue-list-copy .issue-list-note {
		color: #d39b38;
	}

	.issue-list-item > :last-child {
		margin-top: 2px;
		color: var(--text-dim);
	}

	.target-issue-message {
		max-height: min(260px, 35dvh);
		margin: 20px 0;
		overflow: auto;
		padding: 12px;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: rgba(0, 0, 0, 0.14);
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
		line-height: 1.5;
		overflow-wrap: anywhere;
		white-space: pre-wrap;
	}

	.target-config-dialog {
		width: min(760px, 100%);
	}

	.target-config-content {
		display: flex;
		min-height: 0;
		flex-direction: column;
		gap: 16px;
		margin: 20px 0;
	}

	.config-source-input {
		width: 100%;
		min-width: 0;
		padding: 9px 10px;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: var(--surface-raised);
		color: var(--text);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 11px;
	}

	.config-source-input:focus-visible {
		border-color: #399b82;
		outline: none;
	}

	.config-preview-panel {
		min-width: 0;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: rgba(0, 0, 0, 0.14);
		overflow: hidden;
	}

	.config-preview-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 9px 11px;
		border-bottom: 1px solid var(--line);
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
	}

	.config-preview-heading code {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.config-preview-panel pre {
		max-height: min(360px, 42dvh);
		margin: 0;
		overflow: auto;
		padding: 12px;
		color: var(--text);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.target-issue-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}

	.dialog-secondary-button,
	.dialog-primary-button {
		min-height: 34px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 5px;
		font: inherit;
		font-size: 11px;
		cursor: pointer;
	}

	.dialog-secondary-button {
		background: transparent;
		color: var(--text-muted);
	}

	.dialog-primary-button {
		border-color: rgba(223, 109, 88, 0.58);
		background: rgba(223, 109, 88, 0.14);
		color: #ffb09f;
	}

	.dialog-secondary-button:hover,
	.dialog-secondary-button:focus-visible,
	.dialog-primary-button:hover:not(:disabled),
	.dialog-primary-button:focus-visible:not(:disabled) {
		border-color: #df6d58;
		outline: none;
	}

	.dialog-primary-button:hover:not(:disabled),
	.dialog-primary-button:focus-visible:not(:disabled) {
		background: rgba(223, 109, 88, 0.24);
	}

	.dialog-primary-button:disabled {
		cursor: wait;
		opacity: 0.55;
	}

	.detail-meta-item::after,
	.icon-action-button::after,
	.toggle-action::after,
	.target-builds span::after {
		display: none;
	}

	.detail-panel h3 {
		font-size: 27px;
		font-weight: 600;
		letter-spacing: -0.02em;
		line-height: normal;
	}

	.plugin-header {
		margin-bottom: 12px;
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
		margin-bottom: 18px;
	}

	.detail-meta span,
	.detail-meta a,
	.detail-meta button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 5px 7px;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: transparent;
		color: var(--text-muted);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
		font: inherit;
	}

	.detail-meta-link {
		transition:
			border-color 120ms ease,
			background-color 120ms ease,
			color 120ms ease;
		text-decoration: none;
	}

	.detail-meta-link:hover,
	.detail-meta-link:focus-visible {
		border-color: rgba(57, 155, 130, 0.7);
		background: rgba(57, 155, 130, 0.08);
		color: #55c4a5;
		outline: none;
	}

	.detail-meta .detail-meta-item {
		position: relative;
		width: 36px;
		height: 36px;
		justify-content: center;
		padding: 6px;
		color: #399b82;
		line-height: 1;
	}

	.detail-meta .version-control-meta {
		width: auto;
		min-width: 36px;
	}

	.detail-meta-item::after {
		content: attr(data-tooltip);
		position: absolute;
		top: calc(100% + 7px);
		left: 0;
		z-index: 10;
		padding: 7px 9px;
		border: 1px solid rgba(211, 232, 225, 0.18);
		border-radius: 4px;
		background: #17221f;
		box-shadow: 0 8px 18px rgba(0, 0, 0, 0.22);
		color: var(--text);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
		font-weight: 400;
		line-height: 1.35;
		pointer-events: none;
		white-space: nowrap;
		opacity: 0;
		transform: translateY(-3px);
		transition:
			opacity 120ms ease,
			transform 120ms ease;
	}

	.detail-meta-item:hover::after {
		opacity: 1;
		transform: translateY(0);
	}

	.detail-meta-item.is-negative {
		border-color: rgba(223, 109, 88, 0.4);
		color: #df6d58;
	}

	.detail-meta-icon {
		flex: 0 0 auto;
	}

	.detail-meta-version {
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 14px;
		font-weight: 600;
		line-height: 1;
	}

	.detail-meta-version-box {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 4px 6px;
		border: 1px solid rgba(57, 155, 130, 0.3);
		border-radius: 4px;
		background: rgba(57, 155, 130, 0.08);
	}

	.detail-meta-branch {
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
		line-height: 1;
	}

	.panel-section {
		margin-bottom: 18px;
		padding: 14px;
		border: 1px solid rgba(211, 232, 225, 0.1);
		border-radius: 7px;
		background: rgba(255, 255, 255, 0.025);
	}

	.panel-section-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: 10px;
	}

	.panel-section-heading h4,
	.panel-section-heading p {
		margin: 0;
	}

	.panel-section-heading h4 {
		color: var(--text);
		font-size: 14px;
		font-weight: 600;
		letter-spacing: 0;
		text-transform: none;
	}

	.panel-section-heading p {
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 11px;
		line-height: 1.4;
	}

	.panel-section-count {
		min-width: 28px;
		color: #399b82;
		font-size: 20px;
		font-weight: 600;
		line-height: 1;
		text-align: left;
	}

	.source-list .target-list,
	.target-section .target-list {
		margin: 0 -14px -14px;
		padding: 0 14px;
	}

	.source-list .target-item:first-child,
	.target-section .target-item:first-child {
		border-top-color: rgba(211, 232, 225, 0.18);
	}

	.plugin-actions {
		display: flex;
		flex-direction: column;
		margin-bottom: 18px;
	}

	.node-action-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
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

	.icon-action-button {
		position: relative;
	}

	.icon-action-button::after {
		content: attr(data-tooltip);
		position: absolute;
		top: calc(100% + 6px);
		left: 50%;
		z-index: 5;
		padding: 6px 8px;
		border: 1px solid rgba(211, 232, 225, 0.18);
		border-radius: 4px;
		background: #17221f;
		box-shadow: 0 8px 18px rgba(0, 0, 0, 0.22);
		color: var(--text);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
		font-weight: 400;
		line-height: 1.35;
		pointer-events: none;
		white-space: nowrap;
		opacity: 0;
		transform: translate(-50%, -3px);
		transition:
			opacity 120ms ease,
			transform 120ms ease;
	}

	.icon-action-button:hover::after,
	.icon-action-button:focus-visible::after {
		opacity: 1;
		transform: translate(-50%, 0);
	}

	.toggle-action {
		position: relative;
		display: inline-flex;
		width: 34px;
		height: 34px;
		align-items: center;
		justify-content: center;
		padding: 0;
	}

	.toggle-action::after {
		content: attr(data-tooltip);
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		z-index: 5;
		padding: 6px 8px;
		border: 1px solid rgba(211, 232, 225, 0.18);
		border-radius: 4px;
		background: #17221f;
		box-shadow: 0 8px 18px rgba(0, 0, 0, 0.22);
		color: var(--text);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
		font-weight: 400;
		line-height: 1.35;
		pointer-events: none;
		white-space: nowrap;
		opacity: 0;
		transform: translateY(-3px);
		transition:
			opacity 120ms ease,
			transform 120ms ease;
	}

	.toggle-action:hover::after,
	.toggle-action:focus-visible::after {
		opacity: 1;
		transform: translateY(0);
	}

	.toggle-action.is-enabled {
		border-color: rgba(57, 155, 130, 0.5);
		background: rgba(57, 155, 130, 0.12);
		color: #55c4a5;
	}

	.toggle-action.is-disabled {
		border-color: rgba(173, 119, 105, 0.5);
		background: rgba(173, 119, 105, 0.12);
		color: #d49b8b;
	}

	.toggle-action.is-enabled:hover,
	.toggle-action.is-enabled:focus-visible {
		border-color: #55c4a5;
		background: rgba(57, 155, 130, 0.22);
	}

	.toggle-action.is-disabled:hover,
	.toggle-action.is-disabled:focus-visible {
		border-color: #d49b8b;
		background: rgba(173, 119, 105, 0.22);
	}

	.node-action-button.danger {
		border-color: rgba(223, 109, 88, 0.42);
		color: #df6d58;
	}

	.node-action-button:disabled {
		cursor: wait;
		opacity: 0.55;
	}

	.issue-refresh-button {
		border-color: rgba(211, 155, 56, 0.55);
		background: rgba(211, 155, 56, 0.1);
		color: #d39b38;
	}

	.issue-refresh-button:hover:not(:disabled),
	.issue-refresh-button:focus-visible:not(:disabled) {
		border-color: #d39b38;
		background: rgba(211, 155, 56, 0.2);
		color: #f0bd55;
	}

	.missing-source-warning {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 10px;
		padding: 8px 10px;
		border: 1px solid rgba(211, 155, 56, 0.38);
		border-radius: 5px;
		background: rgba(211, 155, 56, 0.08);
		color: #d39b38;
	}

	.missing-source-warning > div {
		text-align: left;
	}

	.missing-source-warning:hover:not(:disabled),
	.missing-source-warning:focus-visible:not(:disabled) {
		border-color: #d39b38;
		background: rgba(211, 155, 56, 0.16);
		color: #f0bd55;
		cursor: pointer;
	}

	.missing-source-warning strong,
	.missing-source-warning small {
		display: block;
	}

	.missing-source-warning strong {
		font-size: 10px;
	}

	.missing-source-warning small {
		margin-top: 3px;
		color: var(--text-muted);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
		line-height: 1.35;
	}

	.icon-action-button {
		display: inline-flex;
		width: 34px;
		height: 34px;
		align-items: center;
		justify-content: center;
		padding: 0;
		flex: 0 0 34px;
	}

	.remote-source-block {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px 16px;
		padding-top: 2px;
	}

	.remote-source-heading {
		align-items: flex-start;
		flex-direction: column;
	}

	.remote-source-actions {
		display: flex;
		min-width: 0;
		align-items: center;
		justify-content: flex-start;
		gap: 6px;
		white-space: nowrap;
	}

	.remote-source-actions .source-button,
	.remote-source-actions .sync-button {
		white-space: nowrap;
	}

	.remote-source-block .git-sync-message {
		grid-column: 1 / -1;
		margin: 0;
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

	.install-button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		border-color: rgba(57, 155, 130, 0.5);
		background: rgba(57, 155, 130, 0.1);
		color: #8de0c5;
	}

	.new-version-note {
		display: inline-flex;
		height: 38px;
		align-items: center;
		box-sizing: border-box;
		gap: 5px;
		padding: 0 8px;
		border: 1px solid rgba(211, 155, 56, 0.4);
		border-radius: 4px;
		background: rgba(211, 155, 56, 0.09);
		color: #d39b38;
		font-size: 14px;
		line-height: 1;
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

	.install-dialog-field > span,
	.install-review span {
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 8px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.install-dialog-fieldset p,
	.install-target-option small,
	.install-destination-option small {
		color: var(--text-muted);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 11px;
		line-height: 1.4;
	}

	.install-dialog {
		width: min(760px, 100%);
	}

	.install-dialog-content {
		display: flex;
		min-height: 0;
		flex-direction: column;
		gap: 14px;
		margin-top: 20px;
		overflow-y: auto;
		padding-right: 2px;
	}

	.install-dialog-field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.install-dialog-field select,
	.install-destination-input {
		width: 100%;
		min-width: 0;
		padding: 9px 10px;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: var(--surface-raised);
		color: var(--text);
		font-size: 11px;
	}

	.install-dialog-fieldset {
		min-width: 0;
		margin: 0;
		padding: 12px;
		border: 1px solid var(--line);
		border-radius: 5px;
	}

	.install-dialog-fieldset legend {
		padding: 0 5px;
		color: var(--text);
		font-size: 12px;
		font-weight: 600;
	}

	.install-fieldset-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}

	.install-fieldset-heading legend {
		padding: 0;
	}

	.install-selection-actions {
		display: flex;
		flex: 0 0 auto;
		gap: 8px;
	}

	.selection-link {
		padding: 2px 0;
		border: 0;
		background: transparent;
		color: #55c4a5;
		cursor: pointer;
		font: inherit;
		font-size: 10px;
	}

	.selection-link:hover:not(:disabled),
	.selection-link:focus-visible:not(:disabled) {
		color: var(--text);
		outline: none;
		text-decoration: underline;
	}

	.selection-link:disabled {
		cursor: wait;
		opacity: 0.5;
	}

	.install-target-options {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
		margin-top: 12px;
	}

	.install-target-option,
	.install-destination-option,
	.install-open-folder-option {
		display: flex;
		min-width: 0;
		align-items: flex-start;
		gap: 9px;
		padding: 9px;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.02);
		cursor: pointer;
	}

	.install-target-option:hover,
	.install-destination-option:hover,
	.install-open-folder-option:hover {
		border-color: var(--line-strong);
		background: rgba(255, 255, 255, 0.04);
	}

	.install-target-option input,
	.install-destination-option input,
	.install-open-folder-option input {
		accent-color: #399b82;
		flex: 0 0 auto;
		margin: 2px 0 0;
	}

	.install-target-option span,
	.install-destination-option span,
	.install-open-folder-option span {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 3px;
	}

	.install-target-option strong,
	.install-destination-option strong,
	.install-open-folder-option strong {
		font-size: 11px;
		font-weight: 600;
	}

	.install-target-option small,
	.install-destination-option small,
	.install-open-folder-option small {
		overflow-wrap: anywhere;
	}

	.install-destination-option {
		margin-top: 8px;
	}

	.install-destination-input {
		margin-top: 8px;
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
	}

	.install-open-folder-option {
		margin-top: 8px;
	}

	.install-destination-input:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.install-review {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 8px;
		padding: 11px 12px;
		border: 1px solid rgba(57, 155, 130, 0.32);
		border-radius: 5px;
		background: rgba(57, 155, 130, 0.06);
	}

	.install-review > div {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.install-review strong {
		font-size: 11px;
		font-weight: 600;
	}

	.install-review code {
		max-width: 100%;
		overflow-wrap: anywhere;
		color: #55c4a5;
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
		line-height: 1.4;
	}

	.install-dialog-actions {
		margin-top: 18px;
	}

	.install-dialog-actions .dialog-secondary-button {
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

	.target-section .target-item {
		padding-inline: 10px;
		border-radius: 4px;
	}

	.target-section .target-item-enabled {
		background: rgba(57, 155, 130, 0.07);
	}

	.target-section .target-item-disabled {
		background: rgba(173, 119, 105, 0.07);
	}

	.target-section .target-item-warning {
		background: rgba(211, 155, 56, 0.07);
	}

	.target-section .target-item-incompatible,
	.target-section .target-item-missing {
		background: rgba(223, 109, 88, 0.07);
	}

	.target-item-actions {
		align-items: flex-start;
		flex-direction: column;
	}

	.source-item {
		align-items: center;
		flex-direction: row;
		justify-content: flex-start;
		gap: 10px;
	}

	.target-section .target-item-actions {
		align-items: center;
		flex-direction: row;
		justify-content: flex-start;
		gap: 25px;
	}

	.target-primary-actions {
		order: -1;
	}

	.target-status-actions {
		margin-left: auto;
	}

	.target-install-label {
		min-width: 0;
		flex: 1 1 auto;
		overflow: hidden;
	}

	.target-actions {
		display: flex;
		flex: 0 0 auto;
		width: auto;
		align-items: flex-start;
		margin-left: 0;
		gap: 10px;
	}

	.target-actions .node-action-row {
		flex: 1;
	}

	.toggle-action.is-config-error {
		border-color: var(--line);
		background: rgba(135, 148, 143, 0.1);
		color: var(--text-dim);
	}

	.issue-config-button {
		border-color: rgba(211, 155, 56, 0.55);
		background: rgba(211, 155, 56, 0.1);
		color: #d39b38;
	}

	.issue-config-button:hover:not(:disabled),
	.issue-config-button:focus-visible:not(:disabled) {
		border-color: #d39b38;
		background: rgba(211, 155, 56, 0.2);
		color: #f0bd55;
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

	.target-plugin-location {
		max-width: min(42vw, 420px);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.target-builds {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		margin-top: 5px;
	}

	.target-builds span {
		position: relative;
		padding: 4px 7px;
		border: 1px solid rgba(211, 232, 225, 0.18);
		border-radius: 999px;
		background: rgba(211, 232, 225, 0.08);
		color: var(--text-muted);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 11px;
		font-weight: 600;
		line-height: 1;
	}

	.target-builds span::after {
		content: attr(data-tooltip);
		position: absolute;
		top: calc(100% + 6px);
		left: 50%;
		z-index: 5;
		padding: 6px 8px;
		border: 1px solid rgba(211, 232, 225, 0.18);
		border-radius: 4px;
		background: #17221f;
		box-shadow: 0 8px 18px rgba(0, 0, 0, 0.22);
		color: var(--text);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
		font-weight: 400;
		line-height: 1.35;
		pointer-events: none;
		white-space: nowrap;
		opacity: 0;
		transform: translate(-50%, -3px);
		transition:
			opacity 120ms ease,
			transform 120ms ease;
	}

	.target-builds span:hover::after,
	.target-builds span:focus-visible::after {
		opacity: 1;
		transform: translate(-50%, 0);
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

	.node-author {
		display: block;
		width: 100%;
		margin: 0;
		color: #c4d2cd;
		font-size: 11px;
		line-height: 1.2;
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
		.install-dialog-backdrop {
			padding: 12px;
		}

		.install-dialog {
			max-height: calc(100dvh - 24px);
			padding: 16px;
		}

		.install-dialog-content {
			margin-top: 16px;
		}

		.install-target-options {
			grid-template-columns: minmax(0, 1fr);
		}

		.install-fieldset-heading {
			flex-direction: column;
		}

		.install-dialog-actions {
			align-items: stretch;
			flex-direction: column-reverse;
		}

		.install-dialog-actions button {
			width: 100%;
		}

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
