<script lang="ts">
	import { clearHoudiniDiscoveryCache } from '$lib/houdini/client';
	import { clearHpmLocalData, type HpmLocalDataKind } from '$lib/settings/local-storage';
	import SettingsPanel from '$lib/settings/SettingsPanel.svelte';
	import { closeSettingsDialog, settingsDialogState } from '$lib/settings/settings-dialog.svelte';

	async function clearLocalData(kind: HpmLocalDataKind | 'discovery-cache') {
		if (kind === 'discovery-cache' || kind === 'all') await clearHoudiniDiscoveryCache();
		if (kind !== 'discovery-cache') clearHpmLocalData(localStorage, kind);
		window.location.reload();
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') closeSettingsDialog();
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if settingsDialogState.open}
	<div class="settings-dialog-backdrop">
		<button
			type="button"
			class="settings-dialog-dismiss"
			aria-label="Close settings dialog"
			onclick={closeSettingsDialog}
		></button>
		<dialog open class="settings-dialog" aria-labelledby="settings-dialog-title">
			<SettingsPanel onClose={closeSettingsDialog} onClearLocalData={clearLocalData} />
		</dialog>
	</div>
{/if}

<style>
	.settings-dialog-backdrop {
		position: fixed;
		inset: 0;
		z-index: 9000;
		display: grid;
		place-items: center;
		padding: 24px;
		background: rgba(9, 14, 15, 0.72);
	}

	.settings-dialog-dismiss {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
		background: transparent;
		cursor: default;
	}

	.settings-dialog {
		position: relative;
		z-index: 1;
		width: min(980px, 100%);
		max-height: calc(100dvh - 48px);
		margin: 0;
		padding: 0;
		overflow: auto;
		border: 1px solid var(--line-strong);
		border-radius: 8px;
		background: #182224;
		box-shadow: 0 22px 70px rgba(0, 0, 0, 0.42);
	}
</style>
