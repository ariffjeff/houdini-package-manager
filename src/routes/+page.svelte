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

<div class="app-shell">
	<header class="topbar">
		<a class="brand" href={resolve('/')} aria-label="HPM home">
			<span class="brand-mark">H</span>
			<span>
				<strong>HPM</strong>
				<small>Houdini package manager</small>
			</span>
		</a>
		<nav aria-label="Primary navigation">
			<a class="active" href="#library">Library</a>
			<a href="#discover">Discover</a>
			<a href="#installs">Houdini installs</a>
			<a href="#activity">Activity</a>
		</nav>
		<div class="topbar-status"><span></span> Local workspace</div>
	</header>

	<main>
		<section class="page-intro">
			<div>
				<p class="section-kicker">Library / Activation surface</p>
			</div>
			<div class="intro-stats" aria-label="Activation summary">
				<div><strong>{activationPlugins.length}</strong><span>plugins</span></div>
				<div><strong>{activationInstalls.length}</strong><span>installs</span></div>
				<div class="attention-stat">
					<strong>{attentionCount}</strong><span>review states</span>
				</div>
			</div>
		</section>

		<section class="workspace" id="library">
			<div class="workspace-header">
				<div class="workspace-actions">
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
					<label class="search-field">
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
								<p>Select a plugin or install to inspect its targets.</p>
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
	.app-shell {
		min-height: 100vh;
		padding: 0 42px 54px;
	}

	.topbar {
		display: flex;
		max-width: 1480px;
		margin: 0 auto;
		padding: 22px 0 18px;
		align-items: center;
		gap: 40px;
		border-bottom: 1px solid rgba(38, 53, 55, 0.1);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		color: #1f2c2d;
		text-decoration: none;
	}

	.brand-mark {
		display: grid;
		width: 32px;
		height: 32px;
		place-items: center;
		border-radius: 7px;
		background: #243738;
		color: #e9c35b;
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 15px;
		font-weight: 700;
	}

	.brand strong,
	.brand small {
		display: block;
	}

	.brand strong {
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 14px;
		letter-spacing: 0.08em;
	}

	.brand small {
		margin-top: 2px;
		color: #7b8983;
		font-size: 10px;
	}

	nav {
		display: flex;
		align-items: center;
		gap: 26px;
		margin-right: auto;
	}

	nav a {
		padding: 8px 0;
		color: #778680;
		font-size: 12px;
		text-decoration: none;
	}

	nav a:hover,
	nav a.active {
		color: #1f2c2d;
	}

	nav a.active {
		border-bottom: 2px solid #e46e58;
	}

	.topbar-status {
		display: flex;
		align-items: center;
		gap: 8px;
		color: #71817b;
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

	main {
		max-width: 1480px;
		margin: 0 auto;
	}

	.page-intro {
		display: flex;
		justify-content: space-between;
		gap: 40px;
		padding: 64px 0 52px;
	}

	.section-kicker {
		margin: 0 0 12px;
		color: #7e8d87;
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
		border-left: 1px solid rgba(38, 53, 55, 0.16);
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
		color: #82918b;
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.intro-stats .attention-stat strong {
		color: #c15b48;
	}

	.workspace {
		padding: 26px;
		border: 1px solid rgba(38, 53, 55, 0.1);
		border-radius: 10px;
		background: rgba(246, 248, 243, 0.76);
		box-shadow: 0 18px 55px rgba(39, 55, 54, 0.08);
	}

	.workspace-header {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 24px;
		margin-bottom: 22px;
	}

	.workspace-actions {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.view-switch {
		display: flex;
		padding: 3px;
		border: 1px solid rgba(38, 53, 55, 0.12);
		border-radius: 6px;
		background: #e6ece7;
	}

	.view-switch button {
		min-width: 64px;
		padding: 7px 11px;
		border: 0;
		border-radius: 4px;
		background: transparent;
		color: #71817b;
		cursor: pointer;
		font-size: 11px;
		font-weight: 600;
	}

	.view-switch button.active {
		background: #fbfcf8;
		box-shadow: 0 2px 7px rgba(39, 55, 54, 0.1);
		color: #243738;
	}

	.search-field {
		display: flex;
		align-items: center;
		gap: 9px;
		width: 190px;
		padding: 7px 11px;
		border: 1px solid rgba(38, 53, 55, 0.12);
		border-radius: 6px;
		background: #fbfcf8;
		color: #7b8b84;
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
		color: #243738;
		font-size: 12px;
	}

	.search-field input::placeholder {
		color: #9aa7a1;
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
		padding: 14px 2px 0;
	}

	.status-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 13px;
		color: #788982;
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
		color: #7c8b85;
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
		white-space: nowrap;
	}

	.detail-panel {
		min-height: 620px;
		padding: 24px;
		border-left: 1px solid rgba(38, 53, 55, 0.1);
	}

	.detail-panel h3 {
		margin-bottom: 12px;
		font-size: 27px;
		font-weight: 600;
		letter-spacing: -0.02em;
	}

	.detail-description {
		margin-bottom: 18px;
		color: #6f8079;
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
		border: 1px solid rgba(38, 53, 55, 0.1);
		border-radius: 4px;
		color: #647670;
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
	}

	.target-heading {
		display: flex;
		justify-content: space-between;
		margin-bottom: 12px;
		color: #70817a;
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
		border-top: 1px solid rgba(38, 53, 55, 0.09);
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
		color: #899791;
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
	}

	.status-pill {
		padding: 5px 7px;
		border-radius: 4px;
		background: rgba(57, 155, 130, 0.1);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
		font-weight: 600;
		white-space: nowrap;
	}

	.status-pill.status-disabled,
	.status-pill.status-missing {
		background: rgba(173, 119, 105, 0.11);
	}

	.status-pill.status-warning {
		background: rgba(211, 155, 56, 0.13);
	}

	.status-pill.status-incompatible {
		background: rgba(223, 109, 88, 0.12);
	}

	.install-facts {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
		margin: 26px 0 36px;
	}

	.install-facts div {
		padding: 10px 9px;
		border: 1px solid rgba(38, 53, 55, 0.1);
		border-radius: 5px;
	}

	.install-facts span,
	.install-facts strong {
		display: block;
	}

	.install-facts span {
		margin-bottom: 5px;
		color: #85948e;
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
		color: #84938d;
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
		border: 1px dashed #a5b2ac;
		border-radius: 50%;
		color: #82938b;
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
		.app-shell {
			padding-right: 24px;
			padding-left: 24px;
		}

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
		.app-shell {
			padding: 0 14px 28px;
		}

		.topbar {
			flex-wrap: wrap;
			gap: 18px;
		}

		nav {
			order: 3;
			width: 100%;
			justify-content: space-between;
			gap: 8px;
			overflow-x: auto;
		}

		nav a {
			white-space: nowrap;
		}

		.topbar-status {
			margin-left: auto;
		}

		.page-intro {
			flex-direction: column;
			padding: 42px 0 34px;
		}

		.intro-stats {
			align-self: start;
		}

		.workspace {
			padding: 16px;
		}

		.workspace-header {
			align-items: start;
			flex-direction: column;
		}

		.workspace-actions {
			width: 100%;
			flex-wrap: wrap;
		}

		.search-field {
			flex: 1;
			min-width: 150px;
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
