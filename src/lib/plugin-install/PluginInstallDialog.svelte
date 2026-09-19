<script lang="ts">
	import { onMount } from 'svelte';
	import { ChevronDown, Tag, X } from '@lucide/svelte';
	import type { ActivationTarget } from '$lib/activation-map/types';
	import type { HoudiniInstall, PluginRecord } from '$lib/houdini/types';
	import type {
		InstallDialogOptions,
		InstallDialogRequest,
		InstallDialogState,
		InstallVersionOption
	} from './types';

	type InstallDraft = {
		version: string;
		selectedInstallIds: string[];
		destinationChoice: string;
		customDestination: string;
		openInstalledFolder: boolean;
		openInstalledConfig: boolean;
	};

	let {
		plugin,
		versions,
		installs,
		targets,
		remoteSourceOptions,
		hpmPluginDestination,
		installState,
		message,
		onClose,
		onCancel,
		onInstall
	} = $props<{
		plugin: Pick<PluginRecord, 'id' | 'name'>;
		versions: InstallVersionOption[];
		installs: HoudiniInstall[];
		targets: ActivationTarget[];
		remoteSourceOptions: string[];
		hpmPluginDestination: string;
		installState: InstallDialogState;
		message: string;
		onClose: () => void;
		onCancel: () => void;
		onInstall: (
			request: InstallDialogRequest,
			options: InstallDialogOptions
		) => void | Promise<void>;
	}>();

	let draft = $state<InstallDraft>({
		version: '',
		selectedInstallIds: [],
		destinationChoice: 'custom',
		customDestination: '',
		openInstalledFolder: false,
		openInstalledConfig: false
	});
	let versionMenuOpen = $state(false);

	let requestedVersion = $derived(draft.version || versions[0]?.value || '');
	let selectedVersion = $derived(
		versions.find((version: InstallVersionOption) => version.value === requestedVersion)
	);
	let selectedInstallCount = $derived(
		installs.filter((install: HoudiniInstall) => draft.selectedInstallIds.includes(install.id))
			.length
	);
	let requestedDestination = $derived(
		draft.destinationChoice === 'custom' ? draft.customDestination.trim() : draft.destinationChoice
	);
	let selectedInstallSummary = $derived(
		selectedInstallCount === installs.length
			? 'All detected Houdini installs'
			: `${selectedInstallCount} of ${installs.length} Houdini installs`
	);
	let canInstall = $derived(
		installState !== 'working' &&
			Boolean(requestedVersion) &&
			versions.some((version: InstallVersionOption) => version.value === requestedVersion) &&
			selectedInstallCount > 0 &&
			Boolean(requestedDestination)
	);

	onMount(resetDraft);

	function resetDraft() {
		const existingSource = remoteSourceOptions[0];
		draft = {
			version: versions[0]?.value ?? '',
			selectedInstallIds: installs.map((install: HoudiniInstall) => install.id),
			destinationChoice: existingSource ?? 'custom',
			customDestination: existingSource ?? '',
			openInstalledFolder: false,
			openInstalledConfig: false
		};
	}

	function selectVersion(version: string) {
		draft.version = version;
		versionMenuOpen = false;
	}

	function focusVersionOption(index: number) {
		const option = document.querySelector<HTMLElement>(
			`[data-version-option="${CSS.escape(String(index))}"]`
		);
		option?.focus();
	}

	function handleVersionTriggerKeydown(event: KeyboardEvent) {
		if (installState === 'working') return;
		if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			versionMenuOpen = true;
			return;
		}
		if (event.key === 'Escape') versionMenuOpen = false;
	}

	function handleVersionOptionKeydown(event: KeyboardEvent, index: number, value: string) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			focusVersionOption(Math.min(index + 1, versions.length - 1));
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			focusVersionOption(Math.max(index - 1, 0));
		} else if (event.key === 'Home') {
			event.preventDefault();
			focusVersionOption(0);
		} else if (event.key === 'End') {
			event.preventDefault();
			focusVersionOption(versions.length - 1);
		} else if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			selectVersion(value);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			versionMenuOpen = false;
			document.getElementById('install-version-trigger')?.focus();
		}
	}

	function closeDialog() {
		if (installState === 'working') return;
		onClose();
	}

	function cancelInstallation() {
		if (installState !== 'working') return;
		onCancel();
	}

	function toggleInstallTarget(installId: string, checked: boolean) {
		draft.selectedInstallIds = checked
			? [...new Set([...draft.selectedInstallIds, installId])]
			: draft.selectedInstallIds.filter((id) => id !== installId);
	}

	function setAllInstallTargets(selected: boolean) {
		draft.selectedInstallIds = selected
			? installs.map((install: HoudiniInstall) => install.id)
			: [];
	}

	function targetForInstall(installId: string) {
		return targets.find(
			(target: ActivationTarget) => target.pluginId === plugin.id && target.installId === installId
		);
	}

	function currentVersionLabel(installId: string) {
		const target = targetForInstall(installId);
		if (!target) return 'Not installed';
		return target.artifactVersion ?? 'Installed, version unknown';
	}

	function submitInstall() {
		if (!canInstall) return;

		const installIds = installs
			.filter((install: HoudiniInstall) => draft.selectedInstallIds.includes(install.id))
			.map((install: HoudiniInstall) => install.id);
		const request: InstallDialogRequest = {
			pluginId: plugin.id,
			version: requestedVersion,
			installIds,
			destinationPath: requestedDestination
		};
		const options: InstallDialogOptions = {
			openInstalledFolder: draft.openInstalledFolder,
			openInstalledConfig: draft.openInstalledConfig
		};

		void onInstall(request, options);
	}
</script>

<div class="issues-dialog-backdrop install-dialog-backdrop">
	<button
		type="button"
		class="issues-dialog-dismiss"
		aria-label="Close install configuration dialog"
		disabled={installState === 'working'}
		onclick={closeDialog}
	></button>
	<dialog
		open
		class="issues-dialog install-dialog"
		aria-labelledby="install-dialog-title"
		aria-describedby="install-dialog-description"
		aria-busy={installState === 'working'}
	>
		<div class="issues-dialog-header">
			<div>
				<h2 id="install-dialog-title">Install {plugin.name}</h2>
				<p id="install-dialog-description">
					Choose a version, review each install's current version, and preview the change before
					installing.
				</p>
			</div>
			<button
				type="button"
				class="dialog-close-button"
				aria-label="Close install configuration dialog"
				disabled={installState === 'working'}
				onclick={closeDialog}
			>
				<X size={18} strokeWidth={1.8} aria-hidden="true" />
			</button>
		</div>
		<div class="install-dialog-content">
			<label class="install-dialog-field">
				<span id="install-version-label">Version</span>
				<div class="version-select">
					<button
						id="install-version-trigger"
						type="button"
						class="version-select-trigger"
						role="combobox"
						aria-labelledby="install-version-label install-version-value"
						aria-controls="install-version-options"
						aria-expanded={versionMenuOpen}
						aria-haspopup="listbox"
						disabled={installState === 'working'}
						onclick={() => (versionMenuOpen = !versionMenuOpen)}
						onkeydown={handleVersionTriggerKeydown}
					>
						<span id="install-version-value" class="version-select-value">
							{#if selectedVersion?.kind === 'tag'}
								<Tag size={14} strokeWidth={1.8} aria-hidden="true" />
							{/if}
							{selectedVersion?.value || 'Choose a version'}
						</span>
						<ChevronDown size={16} strokeWidth={1.8} aria-hidden="true" />
					</button>
					{#if versionMenuOpen}
						<div id="install-version-options" class="version-select-menu" role="listbox">
							{#each versions as version, index (version.value)}
								<button
									type="button"
									class="version-select-option"
									class:is-selected={version.value === requestedVersion}
									role="option"
									aria-selected={version.value === requestedVersion}
									data-version-option={index}
									onclick={() => selectVersion(version.value)}
									onkeydown={(event) => handleVersionOptionKeydown(event, index, version.value)}
								>
									{#if version.kind === 'tag'}
										<Tag size={14} strokeWidth={1.8} aria-hidden="true" />
									{/if}
									<span>{version.value}</span>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</label>

			<fieldset class="install-dialog-fieldset">
				<legend class="install-fieldset-heading">
					<span>Houdini installs</span>
					<span class="install-selection-actions">
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
					</span>
				</legend>
				<div class="install-target-options">
					{#each installs as install (install.id)}
						<label
							class={[
								'install-target-option',
								draft.selectedInstallIds.includes(install.id) ? 'is-selected' : ''
							]}
						>
							<input
								type="checkbox"
								checked={draft.selectedInstallIds.includes(install.id)}
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
								<span class="install-version-change">
									<span class="install-version-current">{currentVersionLabel(install.id)}</span>
									{#if draft.selectedInstallIds.includes(install.id)}
										<span class="install-version-arrow" aria-hidden="true">→</span>
										<span class="install-version-next">
											{requestedVersion || 'Choose a version'}
										</span>
									{/if}
								</span>
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
							checked={draft.destinationChoice === sourcePath}
							disabled={installState === 'working'}
							onchange={() => (draft.destinationChoice = sourcePath)}
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
						checked={draft.destinationChoice === 'custom'}
						disabled={installState === 'working'}
						onchange={() => (draft.destinationChoice = 'custom')}
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
					value={draft.customDestination}
					placeholder={`C:\\Plugins\\${plugin.name}`}
					disabled={draft.destinationChoice !== 'custom' || installState === 'working'}
					oninput={(event) =>
						(draft.customDestination = (event.currentTarget as HTMLInputElement).value)}
				/>
			</fieldset>

			<fieldset class="install-dialog-fieldset">
				<legend>After install</legend>
				<p>Choose which installed plugin locations to open when setup finishes.</p>
				<label class="install-open-folder-option">
					<input
						type="checkbox"
						bind:checked={draft.openInstalledFolder}
						disabled={installState === 'working'}
					/>
					<span>
						<strong>Open plugin folder</strong>
					</span>
				</label>
				<label class="install-open-folder-option">
					<input
						type="checkbox"
						bind:checked={draft.openInstalledConfig}
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
					<strong>{requestedVersion} / {selectedInstallSummary}</strong>
				</div>
				<code>{requestedDestination || 'Choose a destination folder'}</code>
			</div>
			{#if message}
				<p class={['install-message', `is-${installState}`]} aria-live="polite">{message}</p>
			{/if}
		</div>
		<div class="install-dialog-actions">
			{#if installState === 'working'}
				<button type="button" class="dialog-secondary-button" onclick={cancelInstallation}>
					Cancel installation
				</button>
			{:else}
				<button type="button" class="dialog-secondary-button" onclick={closeDialog}>Close</button>
			{/if}
			<button
				type="button"
				class="dialog-primary-button"
				disabled={!canInstall}
				onclick={submitInstall}
			>
				Install plugin
			</button>
		</div>
	</dialog>
</div>

<style>
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

	.install-dialog-field > span,
	.install-review span {
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 8px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

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

	.version-select {
		position: relative;
	}

	.version-select-trigger {
		display: flex;
		width: 100%;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 9px 10px;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: var(--surface-raised);
		color: var(--text);
		font: inherit;
		font-size: 11px;
		text-align: left;
		cursor: pointer;
	}

	.version-select-trigger:hover:not(:disabled),
	.version-select-trigger:focus-visible {
		border-color: var(--line-strong);
		outline: none;
	}

	.version-select-trigger:disabled {
		cursor: wait;
		opacity: 0.6;
	}

	.version-select-value,
	.version-select-option {
		display: flex;
		align-items: center;
		gap: 7px;
	}

	.version-select-menu {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		left: 0;
		z-index: 4;
		max-height: 220px;
		overflow-y: auto;
		padding: 4px;
		border: 1px solid var(--line-strong);
		border-radius: 4px;
		background: var(--surface-raised);
		box-shadow: 0 14px 32px rgba(0, 0, 0, 0.34);
	}

	.version-select-option {
		width: 100%;
		padding: 8px 9px;
		border: 0;
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: 11px;
		text-align: left;
		cursor: pointer;
	}

	.version-select-option:hover,
	.version-select-option:focus-visible,
	.version-select-option.is-selected {
		background: rgba(57, 155, 130, 0.14);
		outline: none;
	}

	.install-dialog-fieldset {
		min-width: 0;
		margin: 0;
		padding: 0 12px 12px 12px;
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
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.install-fieldset-heading > span:first-child {
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

	.install-dialog-fieldset p,
	.install-target-option small,
	.install-destination-option small {
		color: var(--text-muted);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 11px;
		line-height: 1.4;
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

	.install-target-option.is-selected {
		border-color: rgba(57, 155, 130, 0.5);
		background: rgba(57, 155, 130, 0.08);
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
	.install-destination-option small {
		overflow-wrap: anywhere;
	}

	.install-version-change {
		display: flex !important;
		align-items: center;
		flex-direction: row !important;
		flex-wrap: wrap;
		gap: 5px !important;
		margin-top: 2px;
	}

	.install-version-current,
	.install-version-next {
		display: block !important;
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
		line-height: 1.4;
	}

	.install-version-current {
		color: var(--text-muted);
	}

	.install-version-arrow {
		display: block !important;
		color: #e4b75c;
		font-size: 14px;
		font-weight: 600;
		line-height: 1;
	}

	.install-version-next {
		color: #55c4a5;
	}

	.install-destination-option,
	.install-open-folder-option {
		margin-top: 8px;
	}

	.install-destination-input {
		margin-top: 8px;
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
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

	.install-dialog-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 18px;
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
		border-color: rgba(211, 155, 56, 0.18);
		background: rgba(211, 155, 56, 0.1);
		color: rgba(211, 155, 56, 1);
	}

	.dialog-secondary-button:hover,
	.dialog-secondary-button:focus-visible,
	.dialog-primary-button:hover:not(:disabled),
	.dialog-primary-button:focus-visible:not(:disabled) {
		border-color: #e7d6ae;
		outline: none;
	}

	.dialog-primary-button:hover:not(:disabled),
	.dialog-primary-button:focus-visible:not(:disabled) {
		background: rgba(211, 155, 56, 0.18);
	}

	.dialog-primary-button:disabled {
		cursor: wait;
		opacity: 0.55;
	}

	.install-dialog-actions .dialog-secondary-button {
		border-color: rgba(223, 109, 88, 0.5);
		color: #df6d58;
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
			align-items: flex-start;
			flex-direction: column;
		}

		.install-dialog-actions {
			align-items: stretch;
			flex-direction: column-reverse;
		}

		.install-dialog-actions button {
			width: 100%;
		}
	}
</style>
