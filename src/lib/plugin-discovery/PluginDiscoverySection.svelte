<script lang="ts">
	import { onMount } from 'svelte';
	import {
		TriangleAlert,
		ChevronLeft,
		ChevronRight,
		LoaderCircle,
		Package,
		Plus,
		Search,
		ShieldCheck,
		X
	} from '@lucide/svelte';
	import GithubLogo from '$lib/assets/GithubLogo.svelte';
	import type { HoudiniInstall } from '$lib/houdini/types';
	import {
		clearResolvedRepositories,
		loadPluginCatalog,
		pluginDiscoveryState,
		resolveRepositories
	} from './discovery-state.svelte';
	import type { PluginDiscoveryCandidate } from './types';

	let { installs, onInstallCandidate } = $props<{
		installs: HoudiniInstall[];
		onInstallCandidate: (candidate: PluginDiscoveryCandidate) => void;
	}>();

	let catalogSearch = $state('');
	let catalogPage = $state(1);
	let openProvenanceCandidate = $state<PluginDiscoveryCandidate | null>(null);
	const catalogPageSize = 40;

	let filteredCatalog = $derived.by(() => {
		const query = catalogSearch.trim().toLocaleLowerCase();
		if (!query) return pluginDiscoveryState.catalog;

		return pluginDiscoveryState.catalog.filter((entry) =>
			[
				entry.name,
				entry.description,
				entry.author,
				entry.license,
				entry.packageFile,
				...entry.tags,
				entry.repositoryUrl
			]
				.join(' ')
				.toLocaleLowerCase()
				.includes(query)
		);
	});
	let catalogPageCount = $derived(Math.max(1, Math.ceil(filteredCatalog.length / catalogPageSize)));
	let currentCatalogPage = $derived(Math.min(catalogPage, catalogPageCount));
	let visibleCatalog = $derived(
		filteredCatalog.slice(
			(currentCatalogPage - 1) * catalogPageSize,
			currentCatalogPage * catalogPageSize
		)
	);

	onMount(() => {
		void loadPluginCatalog();
	});

	async function handleResolveRepositories() {
		const urls = [
			...new Set(
				pluginDiscoveryState.repositoryInput
					.split(/\r?\n/)
					.map((url) => url.trim())
					.filter(Boolean)
			)
		];
		if (!urls.length) {
			pluginDiscoveryState.resolveError = 'Enter at least one public GitHub repository URL.';
			pluginDiscoveryState.resolveState = 'error';
			pluginDiscoveryState.results = [];
			return;
		}

		await resolveRepositories(urls);
	}

	function clearCandidates() {
		clearResolvedRepositories();
	}

	function installCandidate(candidate: PluginDiscoveryCandidate) {
		if (installs.length === 0) return;
		onInstallCandidate(candidate);
	}

	function addCatalogRepository(repositoryUrl: string) {
		const urls = pluginDiscoveryState.repositoryInput
			.split(/\r?\n/)
			.map((url) => url.trim())
			.filter(Boolean);
		if (!urls.includes(repositoryUrl)) urls.push(repositoryUrl);
		pluginDiscoveryState.repositoryInput = urls.join('\n');
	}

	function resetCatalogSearch() {
		catalogPage = 1;
	}

	function previousCatalogPage() {
		catalogPage = Math.max(1, currentCatalogPage - 1);
	}

	function nextCatalogPage() {
		catalogPage = Math.min(catalogPageCount, currentCatalogPage + 1);
	}

	function shortSha(value: string) {
		return value.slice(0, 7);
	}

	function closeProvenanceDialog() {
		openProvenanceCandidate = null;
	}

	function handleProvenanceDialogKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') closeProvenanceDialog();
	}
</script>

<section id="discover" class="discovery-section" aria-labelledby="plugin-discovery-title">
	<header class="discovery-heading">
		<div>
			<h2 id="plugin-discovery-title">Plugin Discovery</h2>
		</div>
	</header>

	<section class="resolver-panel" aria-labelledby="repository-resolver-title">
		<div class="panel-heading">
			<div>
				<h3 id="repository-resolver-title">Resolve GitHub Repositories</h3>
			</div>
			<span class="count-label">One URL per line</span>
		</div>
		<label for="repository-input">Public Repository URLs</label>
		<textarea
			id="repository-input"
			bind:value={pluginDiscoveryState.repositoryInput}
			placeholder="https://github.com/owner/repository"
			rows="4"></textarea>
		<div class="mt-2.5">
			<button
				type="button"
				class="resolve-button"
				onclick={handleResolveRepositories}
				disabled={pluginDiscoveryState.resolveState === 'loading'}
			>
				{#if pluginDiscoveryState.resolveState === 'loading'}
					<LoaderCircle class="spin" size={18} strokeWidth={1.8} aria-hidden="true" /> Resolving...
				{:else}
					<Search size={18} strokeWidth={1.8} aria-hidden="true" /> Resolve repositories
				{/if}
			</button>
		</div>
		{#if pluginDiscoveryState.resolveError}
			<p class="state-message error-message" role="alert">
				<TriangleAlert size={16} strokeWidth={1.8} aria-hidden="true" />
				{pluginDiscoveryState.resolveError}
			</p>
		{/if}

		{#if pluginDiscoveryState.results.length}
			<div class="result-toolbar">
				<span class="count-label"
					>{pluginDiscoveryState.results.length} candidate{pluginDiscoveryState.results.length === 1
						? ''
						: 's'}</span
				>
				<button
					type="button"
					class="clear-button"
					onclick={clearCandidates}
					aria-label="Clear resolved candidates"
					title="Clear resolved candidates"
				>
					<X size={18} strokeWidth={1.8} aria-hidden="true" /> Clear
				</button>
			</div>
			<div class="result-list" aria-live="polite">
				{#each pluginDiscoveryState.results as result (result.input)}
					{@const candidate = result.candidate}
					<article class:error-result={Boolean(result.error)} class="result-row">
						<div class="result-heading">
							<code>{result.input}</code>
							{#if result.error}
								<span class="result-status error-status"
									><TriangleAlert size={13} strokeWidth={2} aria-hidden="true" /> Failed</span
								>
							{:else if !candidate}
								<span class="result-status">Resolving...</span>
							{/if}
							{#if candidate}
								<div class="candidate-header-controls">
									<button
										type="button"
										class="install-button"
										disabled={installs.length === 0}
										onclick={() => installCandidate(candidate)}
									>
										<Package size={18} strokeWidth={1.8} aria-hidden="true" /> Install
									</button>
								</div>
							{/if}
						</div>

						{#if candidate}
							<div class="candidate-body">
								<div class="candidate-heading">
									<div>
										<h4>{candidate.name}</h4>
										<p>{candidate.description || 'No description provided.'}</p>
									</div>
									<a
										href={candidate.repositoryUrl}
										target="_blank"
										rel="external noopener noreferrer"
										aria-label={`Open ${candidate.name} on GitHub`}
									>
										<GithubLogo size={16} strokeWidth={1.8} aria-hidden="true" />
									</a>
								</div>
								<div class="metadata-grid">
									<div><span>Author</span><strong>{candidate.author || 'Unknown'}</strong></div>
									<div><span>License</span><strong>{candidate.license || 'Unknown'}</strong></div>
									<div><span>Package file</span><code>{candidate.packageFile}</code></div>
									<div>
										<span>Manifest</span><strong
											>{candidate.manifestSource === 'catalog' ? 'Curated' : 'Repository'}</strong
										>
									</div>
									{#if candidate.source === 'catalog' && candidate.pinnedCommit && candidate.manifestBlobSha}
										<button
											type="button"
											class="provenance-button"
											aria-label={`View provenance details for ${candidate.name}`}
											title={`View provenance details for ${candidate.name}`}
											onclick={() => (openProvenanceCandidate = candidate)}
										>
											<ShieldCheck size={17} strokeWidth={1.8} aria-hidden="true" />
										</button>
									{/if}
								</div>
								{#if candidate.warnings.length}
									<div class="warning-list" role="note">
										<TriangleAlert size={16} strokeWidth={1.8} aria-hidden="true" />
										<div>
											<strong>Review before installing</strong>
											{#each candidate.warnings as warning (warning)}<p>{warning}</p>{/each}
										</div>
									</div>
								{/if}
								{#if installs.length === 0}
									<p class="install-hint">
										No Houdini installs detected. Scan for an install before installing.
									</p>
								{/if}
							</div>
						{:else if result.error}
							<p class="result-error" role="alert">
								<TriangleAlert size={16} strokeWidth={1.8} aria-hidden="true" />
								{result.error}
							</p>
						{:else}
							<p class="state-message" role="status">
								<LoaderCircle class="spin" size={16} strokeWidth={1.8} aria-hidden="true" /> Resolving
								repository metadata...
							</p>
						{/if}
					</article>
				{/each}
			</div>
		{/if}
	</section>

	{#if openProvenanceCandidate}
		<div class="provenance-overlay">
			<dialog
				open
				class="provenance-dialog"
				aria-labelledby="provenance-dialog-title"
				onkeydown={handleProvenanceDialogKeydown}
			>
				<div class="provenance-dialog-header">
					<div>
						<h2 id="provenance-dialog-title">Curated provenance</h2>
						<p>{openProvenanceCandidate.name}</p>
					</div>
					<button
						type="button"
						class="provenance-dialog-close"
						aria-label="Close provenance details"
						onclick={closeProvenanceDialog}
					>
						<X size={18} strokeWidth={1.8} aria-hidden="true" />
					</button>
				</div>
				<p>
					Catalog tag
					<code>{openProvenanceCandidate.versions[0]?.value ?? 'Unknown'}</code>
					is checked against the approved commit
					<code title={openProvenanceCandidate.pinnedCommit}
						>{shortSha(openProvenanceCandidate.pinnedCommit!)}</code
					>. The package manifest is checked against approved blob SHA
					<code title={openProvenanceCandidate.manifestBlobSha}
						>{shortSha(openProvenanceCandidate.manifestBlobSha!)}</code
					>.
				</p>
			</dialog>
		</div>
	{/if}

	<section class="catalog-panel" aria-labelledby="curated-catalog-title">
		<div class="panel-heading">
			<div>
				<h3 id="curated-catalog-title">Curated</h3>
			</div>
			{#if pluginDiscoveryState.catalogState === 'ready'}
				<span class="count-label"
					>{filteredCatalog.length} of {pluginDiscoveryState.catalog.length} packages</span
				>
			{/if}
		</div>

		{#if pluginDiscoveryState.catalogState === 'loading'}
			<p class="state-message" role="status">
				<LoaderCircle class="spin" size={16} strokeWidth={1.8} aria-hidden="true" /> Loading curated packages...
			</p>
		{:else if pluginDiscoveryState.catalogState === 'error'}
			<p class="state-message error-message" role="alert">
				<TriangleAlert size={16} strokeWidth={1.8} aria-hidden="true" />
				{pluginDiscoveryState.catalogError}
			</p>
		{:else if pluginDiscoveryState.catalog.length === 0}
			<p class="state-message">The curated catalog is empty.</p>
		{:else}
			<div class="catalog-toolbar">
				<label class="catalog-search" for="catalog-search">
					<Search size={17} strokeWidth={1.8} aria-hidden="true" />
					<span class="sr-only">Search curated packages</span>
					<input
						id="catalog-search"
						bind:value={catalogSearch}
						oninput={resetCatalogSearch}
						placeholder="Search name, author, tags, package file..."
					/>
				</label>
				{#if filteredCatalog.length === 0}
					<p class="catalog-status">No packages match &ldquo;{catalogSearch}&rdquo;.</p>
				{:else}
					<div class="catalog-pagination" aria-label="Catalog pagination">
						<span class="catalog-status">Page {currentCatalogPage} of {catalogPageCount}</span>
						<button
							type="button"
							class="icon-button"
							onclick={previousCatalogPage}
							disabled={currentCatalogPage === 1}
							aria-label="Previous catalog page"
							title="Previous catalog page"
						>
							<ChevronLeft size={18} strokeWidth={1.8} aria-hidden="true" />
						</button>
						<button
							type="button"
							class="icon-button"
							onclick={nextCatalogPage}
							disabled={currentCatalogPage === catalogPageCount}
							aria-label="Next catalog page"
							title="Next catalog page"
						>
							<ChevronRight size={18} strokeWidth={1.8} aria-hidden="true" />
						</button>
					</div>
				{/if}
			</div>

			{#if filteredCatalog.length === 0}
				<p class="state-message">No curated packages match your search.</p>
			{:else}
				<div class="catalog-list" role="list" aria-label="Curated plugin packages">
					{#each visibleCatalog as entry (entry.id)}
						<article class="catalog-row" role="listitem">
							<div class="catalog-main">
								<div class="catalog-title">
									<Package size={16} strokeWidth={1.7} aria-hidden="true" />
									<h4>{entry.name}</h4>
								</div>
								<p>{entry.description}</p>
								<div class="tag-list" aria-label={`${entry.name} tags`}>
									{#each entry.tags as tag (tag)}<span>{tag}</span>{/each}
								</div>
							</div>
							<div class="catalog-meta">
								<span>{entry.author}</span>
								<span>{entry.license}</span>
								<code>{entry.packageFile}</code>
							</div>
							<div class="catalog-actions">
								<a
									href={entry.repositoryUrl}
									target="_blank"
									rel="external noopener noreferrer"
									aria-label={`Open ${entry.name} repository on GitHub`}
									title="Open repository on GitHub"
								>
									<GithubLogo width={16} height={16} color="currentColor" aria-hidden="true" />
								</a>
								<button
									type="button"
									onclick={() => addCatalogRepository(entry.repositoryUrl)}
									aria-label={`Add ${entry.name} to resolver`}
									title="Add to resolver"
								>
									<Plus size={18} strokeWidth={1.8} aria-hidden="true" />
								</button>
							</div>
						</article>
					{/each}
				</div>
			{/if}
		{/if}
	</section>
</section>

<style>
	.discovery-section {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		grid-template-areas:
			'heading'
			'resolver'
			'catalog';
		gap: 18px;
		width: min(1180px, 100%);
		min-width: 0;
		margin: 0 auto;
		padding: 28px clamp(16px, 3vw, 34px) 44px;
	}

	.discovery-heading {
		grid-area: heading;
		min-width: 0;
	}

	.discovery-heading,
	.panel-heading,
	.catalog-toolbar,
	.result-toolbar,
	.catalog-title,
	.candidate-heading,
	.result-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
	}

	.discovery-heading {
		align-items: end;
		padding-bottom: 4px;
	}

	h2,
	h3,
	h4,
	p {
		margin-top: 0;
	}

	h2 {
		margin-bottom: 0;
		font-size: clamp(24px, 3vw, 34px);
		font-weight: 650;
		letter-spacing: 0;
	}

	h3 {
		margin-bottom: 0;
		font-size: 18px;
		font-weight: 650;
	}

	h4 {
		font-size: 16px;
		font-weight: 650;
	}

	.catalog-panel,
	.resolver-panel {
		min-width: 0;
		padding: 18px;
		border: 1px solid var(--line);
		border-radius: 7px;
		background: rgba(19, 28, 30, 0.62);
	}

	.resolver-panel {
		grid-area: resolver;
	}

	.catalog-panel {
		grid-area: catalog;
	}

	.panel-heading {
		align-items: center;
		margin-bottom: 15px;
	}

	.count-label,
	.result-status {
		color: var(--text-dim);
		font-size: 11px;
		font-weight: 650;
		letter-spacing: 0.03em;
		text-transform: uppercase;
	}

	.result-row {
		border: 1px solid var(--line);
		border-radius: 6px;
		background: rgba(30, 42, 44, 0.6);
	}

	.catalog-toolbar {
		align-items: center;
		min-width: 0;
		flex-wrap: wrap;
		margin-bottom: 10px;
	}

	.result-toolbar {
		align-items: center;
		margin-top: 18px;
	}

	.clear-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-height: 29px;
		padding: 5px 9px;
		border: 1px solid var(--line-strong);
		border-radius: 5px;
		background: transparent;
		color: var(--text-muted);
		font: inherit;
		font-size: 11px;
		font-weight: 650;
		cursor: pointer;
	}

	.clear-button:hover,
	.clear-button:focus-visible {
		border-color: var(--line-strong);
		color: var(--text);
		outline: none;
	}

	.catalog-search {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1 1 320px;
		min-width: 0;
		margin: 0;
		padding: 0 10px;
		border: 1px solid var(--line-strong);
		border-radius: 5px;
		background: rgba(8, 14, 16, 0.62);
	}

	.catalog-pagination {
		min-width: 0;
	}

	.catalog-search :global(svg) {
		flex: 0 0 auto;
		color: var(--text-dim);
	}

	.catalog-search input {
		width: 100%;
		min-width: 0;
		min-height: 34px;
		padding: 6px 0;
		border: 0;
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: 12px;
	}

	.catalog-search:focus-within {
		border-color: #69b89b;
		outline: 3px solid rgba(59, 155, 130, 0.26);
		outline-offset: 1px;
	}

	.catalog-search input:focus-visible {
		outline: none;
	}

	.catalog-pagination {
		display: flex;
		align-items: center;
		gap: 6px;
		flex: 0 0 auto;
	}

	.catalog-status {
		margin: 0;
		color: var(--text-dim);
		font-size: 11px;
		line-height: 1.4;
	}

	.icon-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 29px;
		height: 29px;
		padding: 0;
		border: 1px solid var(--line-strong);
		border-radius: 5px;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
	}

	.icon-button:hover:not(:disabled),
	.icon-button:focus-visible {
		border-color: var(--line-strong);
		color: var(--text);
		outline: none;
	}

	.icon-button:disabled {
		color: var(--text-dim);
		cursor: not-allowed;
		opacity: 0.5;
	}

	.catalog-list {
		display: grid;
		max-height: 520px;
		overflow: auto;
		border: 1px solid var(--line);
		border-radius: 6px;
	}

	.catalog-row {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1.5fr) minmax(150px, 0.8fr) auto;
		align-items: center;
		gap: 10px;
		padding: 7px 48px 7px 10px;
		border-bottom: 1px solid var(--line);
		background: rgba(30, 42, 44, 0.44);
	}

	.catalog-row:last-child {
		border-bottom: 0;
	}

	.catalog-main {
		min-width: 0;
	}

	.catalog-title {
		align-items: center;
		justify-content: flex-start;
		gap: 7px;
	}

	.catalog-title :global(svg) {
		flex: 0 0 auto;
		color: #84c9ae;
	}

	.catalog-title h4 {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.catalog-row p {
		margin: 2px 0 4px;
		overflow: hidden;
		color: var(--text-muted);
		font-size: 12px;
		line-height: 1.4;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.catalog-meta {
		display: flex;
		flex-wrap: nowrap;
		gap: 0;
		min-width: 0;
		overflow: hidden;
		color: var(--text-muted);
		font-size: 11px;
	}

	.catalog-meta > * {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.catalog-meta span,
	.catalog-meta code {
		padding: 0 10px;
		border-left: 1px solid var(--line);
	}

	.catalog-meta span:first-child {
		padding-left: 0;
		border-left: none;
	}

	.catalog-meta code {
		max-width: 18ch;
	}

	.catalog-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		position: absolute;
		top: 7px;
		right: 10px;
		bottom: 7px;
		gap: 5px;
		flex-direction: column;
	}

	.catalog-actions a,
	.catalog-actions button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 29px;
		min-height: 29px;
		padding: 5px;
		border: 1px solid transparent;
		border-radius: 5px;
		background: transparent;
		color: var(--text-muted);
		font: inherit;
		font-size: 11px;
		font-weight: 650;
		text-decoration: none;
		white-space: nowrap;
		cursor: pointer;
	}

	.catalog-actions a:hover,
	.catalog-actions a:focus-visible,
	.catalog-actions button:hover,
	.catalog-actions button:focus-visible {
		border-color: var(--line-strong);
		color: var(--text);
		outline: none;
	}

	.catalog-actions button {
		color: #9ccfba;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.candidate-heading p {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
		margin-bottom: 0;
		color: var(--text-muted);
		font-size: 12px;
		line-height: 1.45;
	}

	code {
		color: #c3ddd2;
		font-family: 'Cascadia Code', 'SFMono-Regular', Consolas, monospace;
		font-size: 11px;
		word-break: break-word;
	}

	.tag-list {
		display: flex;
		gap: 4px;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
	}

	.tag-list span {
		flex: 0 0 auto;
		padding: 2px 6px;
		border: 1px solid rgba(132, 201, 174, 0.25);
		border-radius: 4px;
		color: #9ccfba;
		font-size: 10px;
	}

	.catalog-actions a,
	.catalog-actions button,
	.resolve-button,
	.install-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		height: 32px;
		min-height: 32px;
		padding: 7px 10px;
		border: 1px solid var(--line-strong);
		border-radius: 5px;
		font-size: 12px;
		font-weight: 650;
		text-decoration: none;
		cursor: pointer;
	}

	.catalog-actions a,
	.catalog-actions button {
		width: 34px;
		height: 34px;
		min-height: 34px;
		padding: 0;
	}

	label {
		display: block;
		margin-bottom: 7px;
		color: var(--text-muted);
		font-size: 12px;
		font-weight: 650;
	}

	textarea {
		width: 100%;
		border: 1px solid var(--line-strong);
		border-radius: 5px;
		background: rgba(8, 14, 16, 0.62);
		color: var(--text);
		font: inherit;
	}

	textarea {
		min-height: 108px;
		padding: 10px 11px;
		resize: vertical;
		font-size: 13px;
		line-height: 1.5;
	}

	textarea:focus-visible {
		border-color: #69b89b;
		outline: 3px solid rgba(59, 155, 130, 0.26);
		outline-offset: 1px;
	}

	.resolve-button,
	.install-button {
		flex: 0 0 auto;
		background: #2e8065;
		border-color: #3d9b7c;
		color: #f2fff9;
	}

	.resolve-button:hover,
	.resolve-button:focus-visible,
	.install-button:hover,
	.install-button:focus-visible {
		background: #399575;
		outline: none;
	}

	.resolve-button:disabled,
	.install-button:disabled {
		background: rgba(95, 111, 106, 0.34);
		border-color: var(--line);
		color: var(--text-dim);
		cursor: not-allowed;
	}

	.state-message,
	.result-error {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		color: var(--text-muted);
		font-size: 12px;
		line-height: 1.45;
		padding: 11px 13px;
	}

	.state-message :global(svg),
	.result-error :global(svg) {
		flex: 0 0 auto;
		margin-top: 1px;
	}

	.error-message,
	.result-error {
		color: #f0a99a;
	}

	.result-list {
		display: grid;
		gap: 9px;
		margin-top: 18px;
	}

	.result-row {
		overflow: hidden;
	}

	.result-heading {
		align-items: center;
		flex-wrap: wrap;
		padding: 11px 13px;
		background: rgba(255, 255, 255, 0.025);
	}

	.result-heading code {
		flex: 1 1 240px;
		min-width: 0;
		color: var(--text-muted);
	}

	.result-status {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex: 0 0 auto;
	}

	.error-status {
		color: #f0a99a;
	}

	.candidate-header-controls {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		flex: 0 1 auto;
		flex-wrap: wrap;
		gap: 10px;
		min-width: 0;
		margin-left: auto;
	}

	.candidate-body {
		display: grid;
		gap: 10px;
		padding: 11px 13px 10px;
	}

	.candidate-heading {
		align-items: center;
	}

	.candidate-heading a {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		flex: 0 0 auto;
		border: 1px solid var(--line);
		border-radius: 5px;
		color: var(--text-muted);
	}

	.candidate-heading a:hover,
	.candidate-heading a:focus-visible {
		border-color: var(--line-strong);
		color: var(--text);
		outline: none;
	}

	.metadata-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 14px;
		padding-top: 6px;
		border-top: 1px solid var(--line);
	}

	.metadata-grid div {
		display: grid;
		gap: 2px;
		flex: 1 1 120px;
		min-width: 0;
	}

	.metadata-grid span {
		color: var(--text-dim);
		font-size: 10px;
		font-weight: 650;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.metadata-grid strong,
	.metadata-grid code {
		overflow-wrap: anywhere;
		font-size: 12px;
		font-weight: 500;
	}

	.provenance-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		align-self: end;
		width: 29px;
		height: 29px;
		padding: 0;
		border: 1px solid rgba(57, 155, 130, 0.32);
		border-radius: 5px;
		background: rgba(57, 155, 130, 0.06);
		color: #55c4a5;
		cursor: pointer;
	}

	.provenance-button:hover,
	.provenance-button:focus-visible {
		border-color: #55c4a5;
		background: rgba(57, 155, 130, 0.14);
		color: var(--text);
		outline: none;
	}

	.provenance-overlay {
		position: fixed;
		inset: 0;
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		padding: 16px;
		background: rgba(5, 10, 11, 0.62);
	}

	.provenance-dialog {
		position: relative;
		inset: auto;
		box-sizing: border-box;
		max-height: calc(100vh - 32px);
		margin: 0;
		width: min(520px, 100%);
		overflow: auto;
		padding: 18px;
		border: 1px solid var(--line-strong);
		border-radius: 7px;
		background: #182326;
		color: var(--text);
		box-shadow: 0 18px 50px rgba(0, 0, 0, 0.36);
	}

	.provenance-dialog::backdrop {
		background: rgba(5, 10, 11, 0.62);
	}

	.provenance-dialog-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 14px;
	}

	.provenance-dialog h2 {
		margin-bottom: 3px;
		font-size: 18px;
	}

	.provenance-dialog-header p,
	.provenance-dialog > p {
		margin: 0;
		color: var(--text-muted);
		font-size: 12px;
		line-height: 1.5;
	}

	.provenance-dialog-close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
	}

	.provenance-dialog-close:hover,
	.provenance-dialog-close:focus-visible {
		border-color: var(--line-strong);
		color: var(--text);
		outline: none;
	}

	.warning-list {
		display: flex;
		gap: 7px;
		padding: 7px 9px;
		border: 1px solid rgba(226, 169, 92, 0.3);
		border-radius: 5px;
		background: rgba(226, 169, 92, 0.08);
		color: #eac18d;
		font-size: 12px;
		line-height: 1.35;
	}

	.warning-list :global(svg) {
		flex: 0 0 auto;
		margin-top: 1px;
	}

	.warning-list strong {
		display: block;
		margin-bottom: 3px;
		font-weight: 650;
	}

	.warning-list p {
		margin: 0;
	}

	.install-hint {
		max-width: 520px;
		margin: 0;
		flex: 1 1 auto;
		color: #eac18d;
		font-size: 11px;
		line-height: 1.4;
	}

	:global(.spin) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 700px) {
		.discovery-heading,
		.catalog-toolbar {
			align-items: stretch;
			flex-direction: column;
		}

		.resolve-button,
		.install-button {
			width: 100%;
		}

		.metadata-grid {
			gap: 5px 10px;
		}

		.catalog-row {
			grid-template-columns: 1fr;
			gap: 8px;
		}

		.catalog-actions {
			justify-content: space-between;
		}

		.candidate-header-controls {
			justify-content: flex-start;
			width: 100%;
			margin-left: 0;
		}

		.candidate-header-controls .install-button {
			width: auto;
		}
	}

	@media (min-width: 900px) {
		.discovery-section {
			grid-template-columns: minmax(280px, 0.8fr) minmax(0, 1.5fr);
			grid-template-areas:
				'heading heading'
				'catalog resolver';
		}

		.catalog-row {
			grid-template-columns: minmax(0, 1fr) auto;
		}

		.catalog-meta {
			grid-column: 1 / -1;
			max-width: 100%;
		}
	}

	@media (max-width: 440px) {
		.catalog-panel,
		.resolver-panel {
			padding: 14px;
		}

		.result-heading {
			align-items: flex-start;
			flex-direction: column;
			gap: 7px;
		}

		.catalog-pagination {
			justify-content: space-between;
			width: 100%;
		}
	}
</style>
