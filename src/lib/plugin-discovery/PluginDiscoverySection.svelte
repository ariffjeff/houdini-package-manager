<script lang="ts">
	import { onMount } from 'svelte';
	import {
		AlertTriangle,
		Check,
		ExternalLink,
		LoaderCircle,
		Package,
		Search
	} from '@lucide/svelte';
	import GithubLogo from '$lib/assets/GithubLogo.svelte';
	import type { HoudiniInstall } from '$lib/houdini/types';
	import { fetchPluginCatalog, resolvePluginRepositories } from './client';
	import type {
		PluginCatalogEntry,
		PluginDiscoveryCandidate,
		PluginDiscoveryResult,
		PluginDiscoveryVersion
	} from './types';

	let { installs, onInstallCandidate, onActivity } = $props<{
		installs: HoudiniInstall[];
		onInstallCandidate: (candidate: PluginDiscoveryCandidate) => void;
		onActivity?: (event: { status: 'success' | 'error'; title: string; detail: string }) => void;
	}>();

	type CatalogState = 'loading' | 'ready' | 'error';
	type ResolveState = 'idle' | 'loading' | 'error';

	let catalog = $state<PluginCatalogEntry[]>([]);
	let catalogState = $state<CatalogState>('loading');
	let catalogError = $state('');
	let repositoryInput = $state('');
	let results = $state<PluginDiscoveryResult[]>([]);
	let resolveState = $state<ResolveState>('idle');
	let resolveError = $state('');
	let selectedVersions = $state<Record<string, string>>({});
	let resolveController: AbortController | null = null;
	let resolveRequestId = 0;

	onMount(() => {
		let active = true;

		void loadCatalog();

		return () => {
			active = false;
			resolveController?.abort();
		};

		async function loadCatalog() {
			try {
				const response = await fetchPluginCatalog();
				if (!active) return;
				catalog = response.plugins;
				catalogState = 'ready';
			} catch (error) {
				if (!active) return;
				catalogError = error instanceof Error ? error.message : String(error);
				catalogState = 'error';
				onActivity?.({
					status: 'error',
					title: 'Plugin catalog unavailable',
					detail: catalogError
				});
			}
		}
	});

	async function resolveRepositories() {
		const urls = [
			...new Set(
				repositoryInput
					.split(/\r?\n/)
					.map((url) => url.trim())
					.filter(Boolean)
			)
		];
		if (!urls.length) {
			resolveError = 'Enter at least one public GitHub repository URL.';
			resolveState = 'error';
			results = [];
			return;
		}

		resolveController?.abort();
		resolveController = new AbortController();
		const requestId = ++resolveRequestId;
		resolveState = 'loading';
		resolveError = '';
		results = urls.map((input) => ({ input }));
		selectedVersions = {};

		try {
			const response = await resolvePluginRepositories(urls, resolveController.signal);
			if (requestId !== resolveRequestId) return;
			results = response.results;
			selectedVersions = Object.fromEntries(
				response.results.flatMap(({ candidate }) =>
					candidate?.versions[0] ? [[candidate.id, candidate.versions[0].value]] : []
				)
			);
			resolveState = 'idle';
			const failures = response.results.filter((result) => result.error).length;
			onActivity?.({
				status: failures ? 'error' : 'success',
				title: failures ? 'Plugin discovery completed with errors' : 'Plugin repositories resolved',
				detail: `${response.results.length - failures} candidate${response.results.length - failures === 1 ? '' : 's'} ready, ${failures} failed.`
			});
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return;
			if (requestId !== resolveRequestId) return;
			resolveState = 'error';
			resolveError = error instanceof Error ? error.message : String(error);
			results = urls.map((input) => ({ input, error: resolveError }));
			onActivity?.({
				status: 'error',
				title: 'Plugin discovery failed',
				detail: resolveError
			});
		} finally {
			if (requestId === resolveRequestId) resolveController = null;
		}
	}

	function selectVersion(candidateId: string, event: Event) {
		selectedVersions[candidateId] = (event.currentTarget as HTMLSelectElement).value;
	}

	function selectedVersion(
		candidate: PluginDiscoveryCandidate
	): PluginDiscoveryVersion | undefined {
		const selectedValue = selectedVersions[candidate.id] ?? candidate.versions[0]?.value;
		return candidate.versions.find((version) => version.value === selectedValue);
	}

	function installCandidate(candidate: PluginDiscoveryCandidate) {
		const version = selectedVersion(candidate);
		if (!version || installs.length === 0) return;
		onInstallCandidate({ ...candidate, selectedVersion: version });
	}

	function addCatalogRepository(repositoryUrl: string) {
		const urls = repositoryInput
			.split(/\r?\n/)
			.map((url) => url.trim())
			.filter(Boolean);
		if (!urls.includes(repositoryUrl)) urls.push(repositoryUrl);
		repositoryInput = urls.join('\n');
	}
</script>

<section id="discover" class="discovery-section" aria-labelledby="plugin-discovery-title">
	<header class="discovery-heading">
		<div>
			<p class="section-kicker">Plugin discovery</p>
			<h2 id="plugin-discovery-title">Find Houdini packages</h2>
		</div>
		<p class="section-summary">
			Browse the curated catalog or resolve public GitHub repositories into install candidates.
		</p>
	</header>

	<section class="catalog-panel" aria-labelledby="curated-catalog-title">
		<div class="panel-heading">
			<div>
				<p class="section-kicker">Curated</p>
				<h3 id="curated-catalog-title">Recommended packages</h3>
			</div>
			{#if catalogState === 'ready'}
				<span class="count-label">{catalog.length} package{catalog.length === 1 ? '' : 's'}</span>
			{/if}
		</div>

		{#if catalogState === 'loading'}
			<p class="state-message" role="status">
				<LoaderCircle class="spin" size={16} strokeWidth={1.8} aria-hidden="true" /> Loading curated packages...
			</p>
		{:else if catalogState === 'error'}
			<p class="state-message error-message" role="alert">
				<AlertTriangle size={16} strokeWidth={1.8} aria-hidden="true" />
				{catalogError}
			</p>
		{:else if catalog.length === 0}
			<p class="state-message">The curated catalog is empty.</p>
		{:else}
			<div class="catalog-grid">
				{#each catalog as entry (entry.id)}
					<article class="catalog-card">
						<div class="card-heading">
							<div>
								<h4>{entry.name}</h4>
								<p>{entry.description}</p>
							</div>
							<Package size={18} strokeWidth={1.7} aria-hidden="true" />
						</div>
						<div class="metadata-line">
							<span>{entry.author}</span>
							<span>{entry.license}</span>
							<code>{entry.packageFile}</code>
						</div>
						{#if entry.tags.length}
							<div class="tag-list" aria-label={`${entry.name} tags`}>
								{#each entry.tags as tag (tag)}<span>{tag}</span>{/each}
							</div>
						{/if}
						<div class="card-actions">
							<a href={entry.repositoryUrl} target="_blank" rel="external noopener noreferrer">
								<GithubLogo width={15} height={15} color="currentColor" aria-hidden="true" /> Repository
							</a>
							<button type="button" onclick={() => addCatalogRepository(entry.repositoryUrl)}>
								<Search size={15} strokeWidth={1.8} aria-hidden="true" /> Add to resolver
							</button>
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</section>

	<section class="resolver-panel" aria-labelledby="repository-resolver-title">
		<div class="panel-heading">
			<div>
				<p class="section-kicker">Public sources</p>
				<h3 id="repository-resolver-title">Resolve GitHub repositories</h3>
			</div>
			<span class="count-label">One URL per line</span>
		</div>
		<label for="repository-input">Repository URLs</label>
		<textarea
			id="repository-input"
			bind:value={repositoryInput}
			placeholder="https://github.com/owner/repository"
			rows="4"></textarea>
		<div class="resolver-actions">
			<p>Only public <code>github.com</code> repository URLs are supported.</p>
			<button
				type="button"
				class="resolve-button"
				onclick={resolveRepositories}
				disabled={resolveState === 'loading'}
			>
				{#if resolveState === 'loading'}
					<LoaderCircle class="spin" size={16} strokeWidth={1.8} aria-hidden="true" /> Resolving...
				{:else}
					<Search size={16} strokeWidth={1.8} aria-hidden="true" /> Resolve repositories
				{/if}
			</button>
		</div>
		{#if resolveError}
			<p class="state-message error-message" role="alert">
				<AlertTriangle size={16} strokeWidth={1.8} aria-hidden="true" />
				{resolveError}
			</p>
		{/if}

		{#if results.length}
			<div class="result-list" aria-live="polite">
				{#each results as result (result.input)}
					<article class:error-result={Boolean(result.error)} class="result-row">
						<div class="result-heading">
							<code>{result.input}</code>
							{#if result.candidate}
								<span class="result-status ready-status"
									><Check size={13} strokeWidth={2} aria-hidden="true" /> Ready</span
								>
							{:else if result.error}
								<span class="result-status error-status"
									><AlertTriangle size={13} strokeWidth={2} aria-hidden="true" /> Failed</span
								>
							{:else}
								<span class="result-status">Resolving...</span>
							{/if}
						</div>

						{#if result.candidate}
							{@const candidate = result.candidate}
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
										<ExternalLink size={16} strokeWidth={1.8} aria-hidden="true" />
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
								</div>
								<div class="candidate-controls">
									<label for={`version-${candidate.id}`}>Version or ref</label>
									{#if candidate.versions.length}
										<select
											id={`version-${candidate.id}`}
											value={selectedVersions[candidate.id] ?? candidate.versions[0].value}
											onchange={(event) => selectVersion(candidate.id, event)}
										>
											{#each candidate.versions as version (version.value)}
												<option value={version.value}
													>{version.label ?? version.value}{version.isLatest
														? ' (latest)'
														: ''}</option
												>
											{/each}
										</select>
									{:else}
										<p class="muted-control">No refs available</p>
									{/if}
								</div>
								{#if candidate.warnings.length}
									<div class="warning-list" role="note">
										<AlertTriangle size={16} strokeWidth={1.8} aria-hidden="true" />
										<div>
											<strong>Review before installing</strong>
											{#each candidate.warnings as warning (warning)}<p>{warning}</p>{/each}
										</div>
									</div>
								{/if}
								<div class="candidate-footer">
									{#if installs.length === 0}
										<p class="install-hint">
											No Houdini installs detected. Scan for an install before installing.
										</p>
									{/if}
									<button
										type="button"
										class="install-button"
										disabled={installs.length === 0 || !selectedVersion(candidate)}
										onclick={() => installCandidate(candidate)}
									>
										<Package size={16} strokeWidth={1.8} aria-hidden="true" /> Install candidate
									</button>
								</div>
							</div>
						{:else if result.error}
							<p class="result-error" role="alert">
								<AlertTriangle size={16} strokeWidth={1.8} aria-hidden="true" />
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
		{:else if resolveState === 'idle' && !resolveError}
			<p class="empty-state">Resolved candidates will appear here for review.</p>
		{/if}
	</section>
</section>

<style>
	.discovery-section {
		display: grid;
		gap: 18px;
		width: min(1180px, 100%);
		margin: 0 auto;
		padding: 28px clamp(16px, 3vw, 34px) 44px;
	}

	.discovery-heading,
	.panel-heading,
	.card-heading,
	.candidate-heading,
	.resolver-actions,
	.candidate-footer,
	.result-heading,
	.card-actions {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
	}

	.discovery-heading {
		align-items: end;
		padding-bottom: 4px;
	}

	.section-kicker {
		margin: 0 0 5px;
		color: #84c9ae;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
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
		margin-bottom: 5px;
		font-size: 16px;
		font-weight: 650;
	}

	.section-summary {
		max-width: 420px;
		margin: 0;
		color: var(--text-muted);
		font-size: 13px;
		line-height: 1.55;
		text-align: right;
	}

	.catalog-panel,
	.resolver-panel {
		padding: 18px;
		border: 1px solid var(--line);
		border-radius: 7px;
		background: rgba(19, 28, 30, 0.62);
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

	.catalog-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 10px;
	}

	.catalog-card,
	.result-row {
		border: 1px solid var(--line);
		border-radius: 6px;
		background: rgba(30, 42, 44, 0.6);
	}

	.catalog-card {
		display: grid;
		gap: 12px;
		padding: 14px;
	}

	.card-heading :global(svg) {
		flex: 0 0 auto;
		color: #84c9ae;
	}

	.card-heading p,
	.candidate-heading p {
		margin-bottom: 0;
		color: var(--text-muted);
		font-size: 12px;
		line-height: 1.45;
	}

	.metadata-line {
		display: flex;
		flex-wrap: wrap;
		gap: 7px 12px;
		color: var(--text-muted);
		font-size: 11px;
	}

	.metadata-line span + span,
	.metadata-line code {
		padding-left: 12px;
		border-left: 1px solid var(--line);
	}

	code {
		color: #c3ddd2;
		font-family: 'Cascadia Code', 'SFMono-Regular', Consolas, monospace;
		font-size: 11px;
		word-break: break-word;
	}

	.tag-list {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}

	.tag-list span {
		padding: 3px 7px;
		border: 1px solid rgba(132, 201, 174, 0.25);
		border-radius: 4px;
		color: #9ccfba;
		font-size: 10px;
	}

	.card-actions {
		align-items: center;
		gap: 10px;
	}

	.card-actions a,
	.card-actions button,
	.resolve-button,
	.install-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		min-height: 32px;
		padding: 7px 10px;
		border: 1px solid var(--line-strong);
		border-radius: 5px;
		font-size: 12px;
		font-weight: 650;
		text-decoration: none;
		cursor: pointer;
	}

	.card-actions a,
	.card-actions button {
		background: transparent;
		color: var(--text-muted);
	}

	.card-actions button {
		border-color: transparent;
	}

	.card-actions a:hover,
	.card-actions a:focus-visible,
	.card-actions button:hover,
	.card-actions button:focus-visible {
		border-color: var(--line-strong);
		color: var(--text);
		outline: none;
	}

	label {
		display: block;
		margin-bottom: 7px;
		color: var(--text-muted);
		font-size: 12px;
		font-weight: 650;
	}

	textarea,
	select {
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

	textarea:focus-visible,
	select:focus-visible {
		border-color: #69b89b;
		outline: 3px solid rgba(59, 155, 130, 0.26);
		outline-offset: 1px;
	}

	.resolver-actions {
		align-items: center;
		margin-top: 10px;
	}

	.resolver-actions p {
		margin: 0;
		color: var(--text-dim);
		font-size: 11px;
		line-height: 1.4;
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
	.empty-state,
	.result-error {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin: 14px 0 0;
		color: var(--text-muted);
		font-size: 12px;
		line-height: 1.45;
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
		padding: 11px 13px;
		background: rgba(255, 255, 255, 0.025);
	}

	.result-heading code {
		min-width: 0;
		color: var(--text-muted);
	}

	.result-status {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex: 0 0 auto;
	}

	.ready-status {
		color: #8bd4b3;
	}

	.error-status {
		color: #f0a99a;
	}

	.candidate-body {
		display: grid;
		gap: 15px;
		padding: 16px 13px 14px;
	}

	.candidate-heading {
		align-items: center;
	}

	.candidate-heading a {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
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
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 10px;
	}

	.metadata-grid div {
		display: grid;
		gap: 4px;
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

	.candidate-controls {
		display: grid;
		grid-template-columns: minmax(150px, 0.35fr) minmax(0, 1fr);
		align-items: center;
		gap: 12px;
	}

	.candidate-controls label {
		margin: 0;
	}

	select {
		min-height: 34px;
		padding: 6px 9px;
		font-size: 12px;
	}

	.muted-control {
		margin: 0;
		color: var(--text-dim);
		font-size: 12px;
	}

	.warning-list {
		display: flex;
		gap: 9px;
		padding: 10px;
		border: 1px solid rgba(226, 169, 92, 0.3);
		border-radius: 5px;
		background: rgba(226, 169, 92, 0.08);
		color: #eac18d;
		font-size: 12px;
		line-height: 1.45;
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

	.candidate-footer {
		align-items: center;
		padding-top: 2px;
	}

	.install-hint {
		max-width: 520px;
		margin: 0;
		color: #eac18d;
		font-size: 11px;
		line-height: 1.4;
	}

	.empty-state {
		padding: 14px 0 2px;
		color: var(--text-dim);
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
		.resolver-actions,
		.candidate-footer {
			align-items: stretch;
			flex-direction: column;
		}

		.section-summary {
			max-width: none;
			text-align: left;
		}

		.resolve-button,
		.install-button {
			width: 100%;
		}

		.metadata-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.candidate-controls {
			grid-template-columns: 1fr;
			gap: 7px;
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
	}
</style>
