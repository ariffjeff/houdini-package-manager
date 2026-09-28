<script lang="ts">
	import { ArrowRightLeft, CloudDownload, Filter, FunnelX, Play, Search } from '@lucide/svelte';
	import ActivationMap from './ActivationMap.svelte';
	import ActivationTable from './ActivationTable.svelte';
	import PluginDetailPanel from './PluginDetailPanel.svelte';
	import type { ActivityEventStatus } from '$lib/activity/types';
	import type { PluginSource } from '$lib/houdini/types';
	import type { InstallDialogState } from '$lib/plugin-install/types';
	import type {
		ActivationEdge,
		ActivationNode,
		ActivationTarget,
		HoudiniInstall,
		PluginRecord
	} from './types';
	import type {
		PluginDetailAction,
		PluginDetailActionState,
		PluginTargetGroup
	} from './plugin-detail';

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
	type HconfigEvent = { status: ActivityEventStatus; detail: string };

	let {
		view,
		searchQuery,
		selectedNodeId,
		selectedGraphNodeId,
		connectionFilterNodeId,
		focusNodeId,
		isScanActive,
		scanStages,
		scanStatuses,
		scanError,
		discoveryState,
		snapshotLoadState,
		hasDiscoverySnapshot,
		activationPlugins,
		activationInstalls,
		activationTargets,
		filteredPlugins,
		visibleMapNodes,
		visibleMapEdges,
		selectedPlugin,
		selectedOfficialPlugins,
		selectedInstall,
		selectedTargets,
		selectedPluginTargetGroups,
		selectedPluginVersions,
		selectedPluginUpdates,
		selectedPluginGitSource,
		pluginCount,
		enabledCount,
		attentionCount,
		issueItems,
		issuesDialogOpen,
		pluginMigratorOpen,
		filterButtonIsActive,
		pluginScanState,
		pluginActionState,
		gitSyncState,
		gitSyncMessage,
		installState,
		installMessage,
		onGlobalScan,
		onScanStage,
		onInitialScan,
		onRunPluginMigrator,
		onOpenIssues,
		onToggleConnectionFilter,
		onClearSearch,
		onSearchQueryChange,
		onSelectNode,
		onFocusComplete,
		onViewChange,
		onRescanPluginConfigs,
		onRescanInstall,
		onSyncGit,
		onPluginAction,
		onOpenTargetConfig,
		onOpenTargetIssueDetails,
		onOpenInstallDialog,
		onOpenInstallPath,
		onSelectPlugin,
		onHconfigEvent
	} = $props<{
		view: ViewMode;
		searchQuery: string;
		selectedNodeId: string | null;
		selectedGraphNodeId: string | null;
		connectionFilterNodeId: string | null;
		focusNodeId: string | null;
		isScanActive: boolean;
		scanStages: Array<{ stage: ScanStage; label: string }>;
		scanStatuses: Record<ScanStage, ScanStatus>;
		scanError: string;
		discoveryState: 'loading' | 'ready' | 'error';
		snapshotLoadState: ScanState;
		hasDiscoverySnapshot: boolean;
		activationPlugins: PluginRecord[];
		activationInstalls: HoudiniInstall[];
		activationTargets: ActivationTarget[];
		filteredPlugins: PluginRecord[];
		visibleMapNodes: ActivationNode[];
		visibleMapEdges: ActivationEdge[];
		selectedPlugin?: PluginRecord;
		selectedOfficialPlugins: PluginRecord[];
		selectedInstall?: HoudiniInstall;
		selectedTargets: ActivationTarget[];
		selectedPluginTargetGroups: PluginTargetGroup[];
		selectedPluginGitSource?: PluginSource;
		selectedPluginVersions: string[];
		selectedPluginUpdates: string[];
		pluginCount: number;
		enabledCount: number;
		attentionCount: number;
		issueItems: unknown[];
		issuesDialogOpen: boolean;
		pluginMigratorOpen: boolean;
		filterButtonIsActive: boolean;
		pluginScanState: PluginDetailActionState;
		pluginActionState: PluginDetailActionState;
		gitSyncState: PluginDetailActionState;
		gitSyncMessage: string;
		installState: InstallDialogState;
		installMessage: string;
		onGlobalScan: () => void | Promise<void>;
		onScanStage: (stage: ScanStage) => void | Promise<void>;
		onInitialScan: () => void | Promise<void>;
		onRunPluginMigrator: () => void;
		onOpenIssues: () => void;
		onToggleConnectionFilter: () => void;
		onClearSearch: () => void;
		onSearchQueryChange: (value: string) => void;
		onSelectNode: (id: string | null) => void;
		onFocusComplete: () => void;
		onViewChange: (view: ViewMode) => void;
		onRescanPluginConfigs: () => void | Promise<void>;
		onRescanInstall: () => boolean | Promise<boolean>;
		onSyncGit: () => void | Promise<void>;
		onPluginAction: (request: PluginDetailAction) => void | Promise<void>;
		onOpenTargetConfig: (install: HoudiniInstall, target: ActivationTarget) => void;
		onOpenTargetIssueDetails: (install: HoudiniInstall, target: ActivationTarget) => void;
		onOpenInstallDialog: () => void;
		onOpenInstallPath: (path: string) => void | Promise<void>;
		onSelectPlugin: (pluginId: string) => void;
		onHconfigEvent: (event: HconfigEvent) => void;
	}>();

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
</script>

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
				onclick={() => void onGlobalScan()}
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
							onclick={() => void onScanStage(scan.stage)}
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
					onclick={onOpenIssues}
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
						onclick={() => onViewChange('map')}>Map</button
					>
					<button
						type="button"
						class={view === 'table' ? 'active' : ''}
						aria-pressed={view === 'table'}
						onclick={() => onViewChange('table')}>Table</button
					>
				</div>
				<label class="search-field min-w-37.5 flex-1 sm:w-47.5 sm:flex-none">
					<span class="sr-only">Filter plugins or installs</span>
					<span class="search-icon">/</span>
					<input
						value={searchQuery}
						oninput={(event) => onSearchQueryChange(event.currentTarget.value)}
						type="search"
						placeholder="Filter library"
					/>
				</label>
				<button
					type="button"
					class="rescan-button p-2"
					aria-label="Open Plugin Migrator"
					aria-haspopup="dialog"
					aria-expanded={pluginMigratorOpen}
					disabled={isScanActive || !activationInstalls.length || !activationPlugins.length}
					onclick={onRunPluginMigrator}
					data-tooltip="Plugin Migrator"
				>
					<ArrowRightLeft />
				</button>
			</div>
		</div>
	</div>

	{#if discoveryState === 'loading'}
		<div class="workspace-state" aria-live="polite">
			<span class="state-mark">...</span>
			<h2>
				{snapshotLoadState === 'loading' ? 'Loading saved discovery' : 'Scanning Houdini installs'}
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
			<button type="button" class="rescan-button" onclick={() => void onInitialScan()}
				>Try again</button
			>
		</div>
	{:else if !activationInstalls.length}
		<div class="workspace-state">
			<span class="state-mark">+</span>
			<h2>No Houdini installs detected</h2>
			<p>
				HPM needs a Houdini installation with a readable hconfig executable before it can build this
				workspace.
			</p>
		</div>
	{:else if view === 'map'}
		<div class="map-layout">
			<div class="map-column">
				{#if searchQuery || selectedGraphNodeId || connectionFilterNodeId}
					<div class="map-filter-actions">
						{#if searchQuery}
							<button
								type="button"
								class="map-clear-filter-button search-clear-button"
								aria-label="Clear library filter"
								data-tooltip="Clear library filter"
								onclick={onClearSearch}
							>
								<FunnelX size={18} strokeWidth={2} aria-hidden="true" />
							</button>
						{/if}
						{#if selectedGraphNodeId || connectionFilterNodeId}
							<button
								type="button"
								class="map-clear-filter-button"
								class:is-active={filterButtonIsActive}
								aria-label={filterButtonIsActive
									? 'Show all nodes'
									: 'Show nodes connected to selected node'}
								data-tooltip={filterButtonIsActive ? 'Show all nodes' : 'Show connected nodes'}
								onclick={onToggleConnectionFilter}
							>
								{#if filterButtonIsActive}<FunnelX
										size={18}
										strokeWidth={2}
										aria-hidden="true"
									/>{:else}<Filter size={18} strokeWidth={2} aria-hidden="true" />{/if}
							</button>
						{/if}
					</div>
				{/if}
				<ActivationMap
					nodes={visibleMapNodes}
					edges={visibleMapEdges}
					onselect={onSelectNode}
					{focusNodeId}
					onfocuscomplete={onFocusComplete}
				/>
				<div class="surface-footer">
					<div class="status-legend" aria-label="Activation status legend">
						<span><i class="enabled"></i>Enabled</span><span><i class="disabled"></i>Disabled</span
						><span><i class="warning"></i>Review</span><span
							><i class="incompatible"></i>Incompatible</span
						>
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
				pluginGitSource={selectedPluginGitSource}
				pluginVersions={selectedPluginVersions}
				pluginUpdates={selectedPluginUpdates}
				{activationPlugins}
				{isScanActive}
				isInstallScanWorking={scanStatuses.installs.state === 'loading'}
				{pluginScanState}
				{pluginActionState}
				{gitSyncState}
				{gitSyncMessage}
				{installState}
				{installMessage}
				{onRescanPluginConfigs}
				{onRescanInstall}
				{onSyncGit}
				{onPluginAction}
				{onOpenTargetConfig}
				{onOpenTargetIssueDetails}
				{onOpenInstallDialog}
				{onOpenInstallPath}
				{onSelectPlugin}
				{onHconfigEvent}
			/>
		</div>
	{:else}
		<ActivationTable
			plugins={filteredPlugins}
			installs={activationInstalls}
			targets={activationTargets}
			selectedId={selectedNodeId}
			onselect={onSelectNode}
		/>
	{/if}
</section>

<style>
	.library-surface {
		display: flex;
		min-height: 0;
		flex: 1;
		flex-direction: column;
		overflow: hidden;
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
		font-size: 12px;
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
	.scan-card-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		margin: 0;
		color: var(--text-muted);
		font-size: 12px;
		line-height: 1.4;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.scan-card-meta span:first-child {
		color: var(--text-dim);
	}
	.scan-action {
		background: rgba(57, 156, 132, 0.12);
		color: var(--text);
		cursor: pointer;
		font-size: 12px;
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
		font-size: 12px;
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
		align-items: stretch;
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
		font-size: 12px;
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
		font-size: 12px;
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
		position: relative;
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
	}
	.map-filter-actions {
		position: absolute;
		top: 12px;
		right: 12px;
		z-index: 4;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.map-clear-filter-button {
		display: inline-flex;
		width: 34px;
		height: 34px;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: 1px solid var(--line-strong);
		border-radius: 5px;
		background: rgba(21, 29, 32, 0.92);
		color: #d5e4df;
		cursor: pointer;
		box-shadow: 0 6px 18px rgba(0, 0, 0, 0.24);
	}
	.map-clear-filter-button:hover,
	.map-clear-filter-button:focus-visible {
		border-color: #d5e4df;
		background: #202d30;
		color: #edf4f1;
		outline: none;
	}
	.map-clear-filter-button.is-active {
		border-color: var(--accent-orange);
		color: var(--accent-orange);
	}
	.map-clear-filter-button.is-active:hover,
	.map-clear-filter-button.is-active:focus-visible {
		border-color: var(--accent-orange);
		color: var(--accent-orange);
	}
	.search-clear-button {
		border-color: #df6d58;
		color: #df6d58;
	}
	.search-clear-button:hover,
	.search-clear-button:focus-visible {
		border-color: #ffb09f;
		background: #3a2828;
		color: #ffb09f;
		outline: none;
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
		font-size: 12px;
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
		background: #777;
	}
	.status-legend i.disabled {
		background: #4f8f9c;
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
		font-size: 12px;
		white-space: nowrap;
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
		.surface-footer {
			align-items: start;
			flex-direction: column;
		}
	}
</style>
