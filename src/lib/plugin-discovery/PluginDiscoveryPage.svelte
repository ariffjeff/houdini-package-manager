<script lang="ts">
	import { onMount } from 'svelte';
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
		setDiscoveryInstallController
	} from './discovery-state.svelte';
	import type { PluginDiscoveryCandidate } from './types';

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
			provenanceSource: candidate.source,
			pinnedCommit: candidate.pinnedCommit,
			manifestBlobSha: candidate.manifestBlobSha
		};
	});
	let installVersionOptions = $derived.by<InstallVersionOption[]>(() => {
		const candidate = pluginDiscoveryState.installCandidate;
		if (!candidate) return [];

		return [
			...(candidate.selectedVersion ? [candidate.selectedVersion] : []),
			...candidate.versions.filter((version) => version.value !== candidate.selectedVersion?.value)
		];
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

	function openInstallDialog(candidate: PluginDiscoveryCandidate) {
		if (!installs.length) return;
		pluginDiscoveryState.installCandidate = candidate;
		pluginDiscoveryState.installState = 'idle';
		pluginDiscoveryState.installMessage = '';
		pluginDiscoveryState.installDialogOpen = true;
	}

	function closeInstallDialog() {
		if (pluginDiscoveryState.installState === 'working') return;
		pluginDiscoveryState.installDialogOpen = false;
		pluginDiscoveryState.installCandidate = null;
	}

	async function installCandidate(
		selection: InstallDialogSelection,
		options: InstallDialogOptions
	) {
		const candidate = pluginDiscoveryState.installCandidate;
		if (
			!candidate ||
			!candidate.versions.some((version) => version.value === selection.version) ||
			!selection.installIds.length ||
			!selection.destinationPath
		) {
			return;
		}
		const request: InstallPluginRequest = {
			repositoryUrl: candidate.repositoryUrl,
			packageFile: candidate.packageFile,
			version: selection.version,
			installIds: selection.installIds,
			destinationPath: selection.destinationPath
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
			pluginDiscoveryState.installMessage = messages.join(' ');
			pluginDiscoveryState.installDialogOpen = false;
			pluginDiscoveryState.installCandidate = null;
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

{#if pluginDiscoveryState.installDialogOpen && installPlugin}
	<PluginInstallDialog
		plugin={installPlugin}
		versions={installVersionOptions}
		{installs}
		{targets}
		remoteSourceOptions={hpmPluginDestination ? [hpmPluginDestination] : []}
		{hpmPluginDestination}
		installState={pluginDiscoveryState.installState}
		message={pluginDiscoveryState.installMessage}
		onClose={closeInstallDialog}
		onCancel={cancelInstall}
		onInstall={installCandidate}
	/>
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
</style>
