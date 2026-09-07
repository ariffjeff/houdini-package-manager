<script lang="ts">
	import { resolve } from '$app/paths';
	import ActivationMap from '$lib/activation-map/ActivationMap.svelte';
	import ActivationTable from '$lib/activation-map/ActivationTable.svelte';
	import {
		activationEdges,
		activationInstalls,
		activationNodes,
		activationPlugins,
		activationTargets,
		statusLabel,
		targetFor
	} from '$lib/activation-map/fixtures';
	import logo from '$lib/assets/hpm.svg';

	type ViewMode = 'map' | 'table';

	let view = $state<ViewMode>('map');
	let searchQuery = $state('');
	let selectedNodeId = $state<string | null>(null);

	let enabledCount = $derived(
		activationTargets.filter((target) => target.status === 'enabled').length
	);
	let attentionCount = $derived(
		activationTargets.filter((target) =>
			['warning', 'incompatible', 'missing'].includes(target.status)
		).length
	);
	let normalizedQuery = $derived(searchQuery.trim().toLowerCase());
	let selectedNode = $derived(
		selectedNodeId ? activationNodes.find((node) => node.id === selectedNodeId) : undefined
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
		activationNodes.map((node) => ({ ...node, selected: node.id === selectedNodeId }))
	);
	let visibleMapNodes = $derived.by(() => {
		if (!normalizedQuery) return mapNodes;

		const matchingIds = activationNodes
			.filter((node) =>
				`${node.data.label} ${node.data.meta}`.toLowerCase().includes(normalizedQuery)
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

		if (selectedInstall) {
			return activationTargets.filter((target) => target.installId === selectedInstall.id);
		}

		return [];
	});

	function selectNode(id: string | null) {
		selectedNodeId = id;
	}
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
		class="mx-auto flex max-w-370 flex-wrap items-center gap-4.5 border-white/10 py-4.5 lg:flex-nowrap lg:gap-10 lg:py-5.5"
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
		<div class="topbar-status ml-auto lg:ml-0"><span></span> Local workspace</div>
	</header>

	<main class="mx-auto max-w-370">
		<section
			class="rounded-xl border border-white/10 bg-white/[0.035] p-4 shadow-[0_18px_55px_rgba(0,0,0,0.22)] lg:p-6.5"
			id="library"
		>
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
					<label class="search-field min-w-[150px] flex-1 sm:w-[190px] sm:flex-none">
						<span class="sr-only">Filter plugins or installs</span>
						<span class="search-icon">/</span>
						<input bind:value={searchQuery} type="search" placeholder="Filter library" />
					</label>
				</div>
			</div>

			{#if view === 'map'}
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
								<span>{selectedPlugin.license}</span>
								<span>{selectedPlugin.source}</span>
							</div>
							<div class="target-heading">
								<span>Target installs</span>
								<span>{selectedTargets.length}</span>
							</div>
							<div class="target-list">
								{#each activationInstalls as install (install.id)}
									{@const target = targetFor(selectedPlugin.id, install.id)}
									{#if target}
										<div class="target-item">
											<div>
												<strong>{install.label}</strong>
												<small>{install.platform} / {install.build}</small>
											</div>
											<span class={['status-pill', `status-${target.status}`]}
												>{statusLabel(target.status)}</span
											>
										</div>
									{/if}
								{/each}
							</div>
						{:else if selectedInstall}
							<p class="section-kicker">Install detail</p>
							<h3>{selectedInstall.label}</h3>
							<p class="detail-description">
								{selectedInstall.role}. Package files are resolved from {selectedInstall.userPreferences}.
							</p>
							<div class="install-facts">
								<div><span>Build</span><strong>{selectedInstall.build}</strong></div>
								<div><span>Platform</span><strong>{selectedInstall.platform}</strong></div>
								<div><span>Packages</span><strong>{selectedInstall.packageCount}</strong></div>
							</div>
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

	.map-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 300px;
		gap: 18px;
	}

	.map-column {
		min-width: 0;
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
		min-height: 620px;
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
		min-height: 560px;
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
			grid-template-columns: minmax(0, 1fr);
		}

		.detail-panel {
			min-height: auto;
			padding: 24px 4px 4px;
			border-top: 1px solid rgba(38, 53, 55, 0.1);
			border-left: 0;
		}

		.detail-empty {
			min-height: 180px;
		}
	}

	@media (max-width: 760px) {
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
