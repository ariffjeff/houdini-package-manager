<script lang="ts">
	import { onMount } from 'svelte';
	import type { HoudiniInstall } from '$lib/houdini/types';
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
		InstallDialogRequest,
		InstallDialogState,
		InstallVersionOption
	} from '$lib/plugin-install/types';
	import PluginDiscoverySection from './PluginDiscoverySection.svelte';
	import type { PluginDiscoveryCandidate } from './types';

	let installs = $state<HoudiniInstall[]>([]);
	let discoveryInstallCandidate = $state<PluginDiscoveryCandidate | null>(null);
	let installDialogOpen = $state(false);
	let installState = $state<InstallDialogState>('idle');
	let installMessage = $state('');
	let loadingState = $state<'loading' | 'ready' | 'error'>('loading');
	let loadingError = $state('');
	let installController: AbortController | null = null;

	let installPlugin = $derived<InstallDialogPlugin | undefined>(
		discoveryInstallCandidate
			? {
					id: discoveryInstallCandidate.id,
					name: discoveryInstallCandidate.name,
					repositoryUrl: discoveryInstallCandidate.repositoryUrl,
					packageFile: discoveryInstallCandidate.packageFile
				}
			: undefined
	);
	let installVersionOptions = $derived.by<InstallVersionOption[]>(() => {
		const candidate = discoveryInstallCandidate;
		if (!candidate) return [];

		return [
			...(candidate.selectedVersion ? [candidate.selectedVersion] : []),
			...candidate.versions.filter((version) => version.value !== candidate.selectedVersion?.value)
		];
	});
	let hpmPluginDestination = $derived.by(() => {
		if (!discoveryInstallCandidate) return '';
		const userPreferences = installs[0]?.userPreferences;
		const pluginSlug = discoveryInstallCandidate.repository
			.toLowerCase()
			.replace(/[^a-z0-9._-]+/g, '-');
		if (!userPreferences || !pluginSlug) return '';

		const separator = userPreferences.includes('\\') ? '\\' : '/';
		const documentsPath = userPreferences.replace(/[\\/]houdini[^\\/]*$/i, '');
		return `${documentsPath}${separator}HPM${separator}plugins${separator}${pluginSlug}`;
	});

	onMount(() => {
		void loadInstalls();
		return () => installController?.abort();
	});

	async function loadInstalls() {
		loadingState = 'loading';
		loadingError = '';
		try {
			const snapshot = await fetchHoudiniDiscoverySnapshot();
			const response = snapshot ?? (await fetchHoudiniDiscovery());
			installs = response.installs;
			loadingState = 'ready';
		} catch (error) {
			loadingState = 'error';
			loadingError = error instanceof Error ? error.message : String(error);
		}
	}

	function openInstallDialog(candidate: PluginDiscoveryCandidate) {
		if (!installs.length) return;
		discoveryInstallCandidate = candidate;
		installState = 'idle';
		installMessage = '';
		installDialogOpen = true;
	}

	function closeInstallDialog() {
		if (installState === 'working') return;
		installDialogOpen = false;
		discoveryInstallCandidate = null;
	}

	async function installCandidate(request: InstallDialogRequest, options: InstallDialogOptions) {
		const candidate = discoveryInstallCandidate;
		if (
			!candidate ||
			request.repositoryUrl !== candidate.repositoryUrl ||
			request.packageFile !== candidate.packageFile ||
			!candidate.versions.some((version) => version.value === request.version) ||
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
			installs = result.discovery.installs;
			installState = 'success';
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
			installMessage = messages.join(' ');
			installDialogOpen = false;
			discoveryInstallCandidate = null;
		} catch (error) {
			if (
				controller.signal.aborted ||
				(error instanceof DOMException && error.name === 'AbortError')
			) {
				installState = 'idle';
				installMessage = 'Installation cancelled.';
			} else {
				installState = 'error';
				installMessage = error instanceof Error ? error.message : String(error);
			}
		} finally {
			if (installController === controller) installController = null;
		}
	}

	function cancelInstall() {
		installController?.abort();
	}
</script>

{#if loadingState === 'error'}
	<p class="discovery-page-message" role="alert">{loadingError}</p>
{:else if loadingState === 'loading'}
	<p class="discovery-page-message" role="status">Loading Houdini installations...</p>
{:else}
	<PluginDiscoverySection
		{installs}
		onInstallCandidate={openInstallDialog}
	/>
{/if}

{#if installDialogOpen && installPlugin}
	<PluginInstallDialog
		plugin={installPlugin}
		versions={installVersionOptions}
		{installs}
		targets={[]}
		remoteSourceOptions={hpmPluginDestination ? [hpmPluginDestination] : []}
		{hpmPluginDestination}
		{installState}
		message={installMessage}
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
