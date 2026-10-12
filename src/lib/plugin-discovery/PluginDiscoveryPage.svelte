<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { X } from '@lucide/svelte';
	import type { ActivationTarget, PluginRecord } from '$lib/activation-map/types';
	import type { HoudiniInstall, InstallPluginRequest } from '$lib/houdini/types';
	import {
		fetchHoudiniDiscovery,
		fetchHoudiniDiscoverySnapshot,
		installHoudiniPlugin,
		runHoudiniPluginAction
	} from '$lib/houdini/client';
	import PluginInstallDialog from '$lib/plugin-install/PluginInstallDialog.svelte';
	import type {
		InstallDialogOptions,
		InstallDialogPlugin,
		InstallDialogSelection,
		InstallVersionOption
	} from '$lib/plugin-install/types';
	import PluginDiscoverySection from './PluginDiscoverySection.svelte';
	import {
		cancelDiscoveryInstall,
		pluginDiscoveryState,
		persistInstallQueue,
		setDiscoveryInstallController
	} from './discovery-state.svelte';
	import type { PluginDiscoveryCandidate } from './types';

	let { mode = 'discover' } = $props<{ mode?: 'discover' | 'install' }>();

	let installs = $state<HoudiniInstall[]>([]);
	let plugins = $state<PluginRecord[]>([]);
	let targets = $state<ActivationTarget[]>([]);
	let loadingState = $state<'loading' | 'ready' | 'error'>('loading');
	let loadingError = $state('');

	let installPlugin = $derived.by<InstallDialogPlugin | undefined>(() => {
		const candidate = pluginDiscoveryState.installCandidate;
		if (!candidate) return undefined;

		const installedPlugin = plugins.find((plugin) =>
			sameRepositoryUrl(plugin.repositoryUrl, candidate.repositoryUrl)
		);
		return {
			id: installedPlugin?.id ?? candidate.id,
			name: candidate.name,
			repositoryUrl: candidate.repositoryUrl,
			packageFile: candidate.packageFile,
			packageFiles: candidate.packageFiles,
			manifestPreflight: candidate.manifestPreflight,
			provenanceSource: candidate.source,
			pinnedCommit: candidate.pinnedCommit,
			manifestBlobSha: candidate.manifestBlobSha
		};
	});
	let installVersionOptions = $derived.by<InstallVersionOption[]>(() => {
		const candidate = pluginDiscoveryState.installCandidate;
		if (!candidate) return [];

		return candidate.versions;
	});
	let hpmPluginDestination = $derived.by(() => {
		if (!pluginDiscoveryState.installCandidate) return '';
		const userPreferences = installs[0]?.userPreferences;
		const pluginSlug = pluginDiscoveryState.installCandidate.repository
			.toLowerCase()
			.replace(/[^a-z0-9._-]+/g, '-');
		if (!userPreferences || !pluginSlug) return '';

		const separator = userPreferences.includes('\\') ? '\\' : '/';
		const documentsPath = userPreferences.replace(/[\\/]houdini[^\\/]*$/i, '');
		return `${documentsPath}${separator}HPM${separator}plugins${separator}${pluginSlug}`;
	});

	onMount(() => {
		void loadInstalls();
	});

	async function loadInstalls() {
		loadingState = 'loading';
		loadingError = '';
		try {
			const snapshot = await fetchHoudiniDiscoverySnapshot();
			const response = snapshot ?? (await fetchHoudiniDiscovery());
			setDiscoveryState(response.installs, response.plugins, response.targets);
			loadingState = 'ready';
		} catch (error) {
			loadingState = 'error';
			loadingError = error instanceof Error ? error.message : String(error);
		}
	}

	function setDiscoveryState(
		nextInstalls: HoudiniInstall[],
		nextPlugins: PluginRecord[],
		nextTargets: ActivationTarget[]
	) {
		installs = nextInstalls;
		plugins = nextPlugins;
		targets = nextTargets;
	}

	function sameRepositoryUrl(left: string | null | undefined, right: string | null | undefined) {
		if (!left || !right) return false;
		return left.trim().toLowerCase() === right.trim().toLowerCase();
	}

	function installKey(candidate: PluginDiscoveryCandidate): string {
		return `${candidate.repositoryUrl}::${candidate.packageFile}`;
	}

	function openInstallDialog(candidate: PluginDiscoveryCandidate) {
		if (!installs.length) return;
		const key = installKey(candidate);
		const existingIndex = pluginDiscoveryState.installQueue.findIndex(
			(queuedCandidate) => installKey(queuedCandidate) === key
		);
		const wasAlreadyStaged = existingIndex !== -1;
		if (existingIndex === -1) {
			pluginDiscoveryState.installQueue = [...pluginDiscoveryState.installQueue, candidate];
		}
		pluginDiscoveryState.activeInstallKey = key;
		pluginDiscoveryState.installCandidate = candidate;
		persistInstallQueue();
		pluginDiscoveryState.installState = 'idle';
		pluginDiscoveryState.installMessage = '';
		pluginDiscoveryState.installDialogOpen = true;
		if (mode === 'discover' && wasAlreadyStaged) void goto(resolve('/install'));
	}

	function selectInstallCandidate(candidate: PluginDiscoveryCandidate) {
		if (pluginDiscoveryState.installState === 'working') return;
		pluginDiscoveryState.activeInstallKey = installKey(candidate);
		pluginDiscoveryState.installCandidate = candidate;
		pluginDiscoveryState.installState = 'idle';
		pluginDiscoveryState.installMessage = '';
		persistInstallQueue();
	}

	function removeInstallCandidate(candidate: PluginDiscoveryCandidate) {
		if (pluginDiscoveryState.installState === 'working') return;
		const key = installKey(candidate);
		const remaining = pluginDiscoveryState.installQueue.filter(
			(queuedCandidate) => installKey(queuedCandidate) !== key
		);
		pluginDiscoveryState.installQueue = remaining;
		persistInstallQueue();
		if (pluginDiscoveryState.activeInstallKey !== key) return;

		const nextCandidate = remaining[0];
		if (nextCandidate) {
			selectInstallCandidate(nextCandidate);
			return;
		}
		closeInstallDialog();
	}

	function closeInstallDialog() {
		if (pluginDiscoveryState.installState === 'working') return;
		pluginDiscoveryState.installDialogOpen = false;
		pluginDiscoveryState.installQueue = [];
		pluginDiscoveryState.activeInstallKey = '';
		pluginDiscoveryState.installCandidate = null;
		persistInstallQueue();
		if (mode === 'install') void goto(resolve('/discover'));
	}

	async function installCandidate(
		selection: InstallDialogSelection,
		options: InstallDialogOptions
	) {
		const candidate = pluginDiscoveryState.installCandidate;
		const packageFiles =
			candidate?.packageFiles ?? (candidate?.packageFile ? [candidate.packageFile] : []);
		if (
			!candidate ||
			!packageFiles.includes(selection.packageFile) ||
			!candidate.versions.some((version) => version.value === selection.version) ||
			!selection.installIds.length ||
			!selection.destinationPath
		) {
			return;
		}
		const request: InstallPluginRequest = {
			repositoryUrl: candidate.repositoryUrl,
			packageFile: selection.packageFile,
			version: selection.version,
			installIds: selection.installIds,
			destinationPath: selection.destinationPath,
			...(selection.correctedConfigText !== undefined
				? { correctedConfigText: selection.correctedConfigText }
				: {})
		};

		pluginDiscoveryState.installState = 'working';
		pluginDiscoveryState.installMessage = '';
		const controller = new AbortController();
		setDiscoveryInstallController(controller);
		try {
			const result = await installHoudiniPlugin(request, controller.signal);
			setDiscoveryState(
				result.discovery.installs,
				result.discovery.plugins,
				result.discovery.targets
			);
			pluginDiscoveryState.installState = 'success';
			const messages = [result.message];
			if (options.openInstalledFolder) {
				try {
					await runHoudiniPluginAction({
						action: 'open-path',
						installId: request.installIds[0],
						path: request.destinationPath
					});
				} catch (error) {
					messages.push(error instanceof Error ? error.message : String(error));
				}
			}
			if (options.openInstalledConfig) {
				try {
					const installedPlugin = result.discovery.plugins.find(
						(plugin) => plugin.repositoryUrl === request.repositoryUrl
					);
					if (!installedPlugin) throw new Error('The installed package config was not found.');
					await runHoudiniPluginAction({
						pluginId: installedPlugin.id,
						action: 'open-config',
						installId: request.installIds[0]
					});
				} catch (error) {
					messages.push(error instanceof Error ? error.message : String(error));
				}
			}
			const completedKey = installKey(candidate);
			const remaining = pluginDiscoveryState.installQueue.filter(
				(queuedCandidate) => installKey(queuedCandidate) !== completedKey
			);
			pluginDiscoveryState.installQueue = remaining;
			pluginDiscoveryState.installMessage = messages.join(' ');
			if (remaining.length) {
				const nextCandidate = remaining[0];
				pluginDiscoveryState.activeInstallKey = installKey(nextCandidate);
				pluginDiscoveryState.installCandidate = nextCandidate;
				pluginDiscoveryState.installState = 'idle';
				persistInstallQueue();
			} else {
				pluginDiscoveryState.installDialogOpen = false;
				pluginDiscoveryState.activeInstallKey = '';
				pluginDiscoveryState.installCandidate = null;
				persistInstallQueue();
				void goto(resolve('/discover'));
			}
		} catch (error) {
			if (
				controller.signal.aborted ||
				(error instanceof DOMException && error.name === 'AbortError')
			) {
				pluginDiscoveryState.installState = 'idle';
				pluginDiscoveryState.installMessage = 'Installation cancelled.';
			} else {
				pluginDiscoveryState.installState = 'error';
				pluginDiscoveryState.installMessage =
					error instanceof Error ? error.message : String(error);
			}
		} finally {
			setDiscoveryInstallController(null);
		}
	}

	function cancelInstall() {
		cancelDiscoveryInstall();
	}
</script>

{#if mode === 'discover'}
	{#if loadingState === 'error'}
		<p class="discovery-page-message" role="alert">{loadingError}</p>
	{:else if loadingState === 'loading'}
		<p class="discovery-page-message" role="status">Loading Houdini installations...</p>
	{:else}
		<PluginDiscoverySection {installs} onInstallCandidate={openInstallDialog} />
	{/if}

	{#if pluginDiscoveryState.installMessage && !pluginDiscoveryState.installDialogOpen}
		<p class="discovery-page-message" role="status">{pluginDiscoveryState.installMessage}</p>
	{/if}
{:else if loadingState === 'error'}
	<p class="discovery-page-message" role="alert">{loadingError}</p>
{:else if loadingState === 'loading'}
	<p class="discovery-page-message" role="status">Loading Houdini installations...</p>
{:else if !installPlugin}
	<p class="discovery-page-message" role="status">
		Choose a plugin from <a href={resolve('/discover')}>Discover Plugins</a> to start an installation.
	</p>
{:else}
	<nav class="install-queue" aria-label="Plugins queued for installation">
		<div class="install-queue-label">
			<span>Install queue</span>
			<strong>{pluginDiscoveryState.installQueue.length}</strong>
		</div>
		<div class="install-queue-items">
			{#each pluginDiscoveryState.installQueue as candidate (installKey(candidate))}
				<div
					class:active={installKey(candidate) === pluginDiscoveryState.activeInstallKey}
					class="install-queue-item"
				>
					<button
						type="button"
						class="install-queue-select"
						disabled={pluginDiscoveryState.installState === 'working'}
						onclick={() => selectInstallCandidate(candidate)}
					>
						<span>{candidate.name}</span>
						<code>{candidate.packageFile}</code>
					</button>
					<button
						type="button"
						class="install-queue-remove"
						aria-label={`Remove ${candidate.name} from install queue`}
						title={`Remove ${candidate.name}`}
						disabled={pluginDiscoveryState.installState === 'working'}
						onclick={() => removeInstallCandidate(candidate)}
					>
						<X size={14} strokeWidth={2} aria-hidden="true" />
					</button>
				</div>
			{/each}
		</div>
	</nav>
	{#key pluginDiscoveryState.activeInstallKey}
		<PluginInstallDialog
			plugin={installPlugin}
			versions={installVersionOptions}
			{installs}
			{targets}
			remoteSourceOptions={hpmPluginDestination ? [hpmPluginDestination] : []}
			{hpmPluginDestination}
			installState={pluginDiscoveryState.installState}
			message={pluginDiscoveryState.installMessage}
			presentation="page"
			onClose={closeInstallDialog}
			onCancel={cancelInstall}
			onInstall={installCandidate}
		/>
	{/key}
{/if}

<style>
	.discovery-page-message {
		width: min(1180px, calc(100% - 32px));
		margin: 18px auto 0;
		padding: 14px 16px;
		border: 1px solid var(--line);
		border-radius: 8px;
		color: var(--text-muted);
	}

	.discovery-page-message a {
		color: var(--text);
		font-weight: 600;
	}

	.install-queue {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		margin-bottom: 14px;
		padding: 7px 9px;
		border: 1px solid var(--line);
		border-radius: 7px;
		background: rgba(255, 255, 255, 0.025);
	}

	.install-queue-label {
		display: inline-flex;
		align-items: center;
		flex: 0 0 auto;
		gap: 6px;
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.install-queue-label strong {
		color: var(--accent-orange);
		font-size: 11px;
	}

	.install-queue-items {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 6px;
		overflow-x: auto;
		padding: 1px 0;
	}

	.install-queue-item {
		display: flex;
		min-width: 0;
		flex: 0 0 auto;
		align-items: center;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.12);
	}

	.install-queue-item.active {
		border-color: rgba(57, 155, 130, 0.7);
		background: rgba(57, 155, 130, 0.1);
	}

	.install-queue-select,
	.install-queue-remove {
		border: 0;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
	}

	.install-queue-select {
		display: flex;
		min-width: 0;
		max-width: 240px;
		align-items: center;
		gap: 7px;
		padding: 5px 7px;
		font-size: 11px;
		text-align: left;
	}

	.install-queue-select span,
	.install-queue-select code {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.install-queue-select span {
		color: var(--text);
		font-weight: 600;
	}

	.install-queue-select code {
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
	}

	.install-queue-select:hover,
	.install-queue-select:focus-visible,
	.install-queue-remove:hover,
	.install-queue-remove:focus-visible {
		color: var(--text);
		outline: none;
	}

	.install-queue-remove {
		display: inline-flex;
		align-items: center;
		align-self: stretch;
		padding: 0 7px;
		border-left: 1px solid var(--line);
	}

	.install-queue-remove:hover,
	.install-queue-remove:focus-visible {
		background: rgba(223, 109, 88, 0.12);
		color: #ffb09f;
	}

	@media (max-width: 620px) {
		.install-queue {
			align-items: flex-start;
			flex-direction: column;
			gap: 5px;
		}

		.install-queue-items {
			width: 100%;
		}
	}
</style>
