<script lang="ts">
	import { ArrowRight, Check, Copy, Search, X } from '@lucide/svelte';
	import type { ActivationTarget } from '$lib/activation-map/types';
	import type {
		HoudiniInstall,
		HoudiniPluginMigrationRequest,
		PluginRecord
	} from '$lib/houdini/types';

	type MigrationState = 'idle' | 'working' | 'success' | 'error';

	let { plugins, installs, targets, migrationState, message, onClose, onMigrate } = $props<{
		plugins: PluginRecord[];
		installs: HoudiniInstall[];
		targets: ActivationTarget[];
		migrationState: MigrationState;
		message: string;
		onClose: () => void;
		onMigrate: (request: HoudiniPluginMigrationRequest) => void;
	}>();
	let sourceInstallId = $state('');
	let destinationInstallIds = $state<string[]>([]);
	let selectedPluginIds = $state<string[]>([]);
	let pluginQuery = $state('');
	let activeSourceInstallId = $derived(sourceInstallId || installs[0]?.id || '');

	let sourcePlugins = $derived(
		plugins.filter((plugin: PluginRecord) =>
			targets.some(
				(target: ActivationTarget) =>
					target.pluginId === plugin.id &&
					target.installId === activeSourceInstallId &&
					Boolean(target.packagePath)
			)
		)
	);
	let destinationInstalls = $derived(
		installs.filter((install: HoudiniInstall) => install.id !== activeSourceInstallId)
	);
	let visiblePlugins = $derived.by(() => {
		const query = pluginQuery.trim().toLowerCase();
		return query
			? plugins.filter((plugin: PluginRecord) =>
					[plugin.name, plugin.id, plugin.packageFile].some((value) =>
						value.toLowerCase().includes(query)
					)
				)
			: plugins;
	});
	let allAvailableSelected = $derived(
		sourcePlugins.length > 0 &&
			sourcePlugins.every((plugin: PluginRecord) => selectedPluginIds.includes(plugin.id))
	);
	let canMigrate = $derived(
		migrationState !== 'working' &&
			Boolean(activeSourceInstallId) &&
			destinationInstallIds.length > 0 &&
			selectedPluginIds.length > 0
	);

	function isPluginAvailable(pluginId: string, installId = activeSourceInstallId) {
		return targets.some(
			(target: ActivationTarget) =>
				target.pluginId === pluginId &&
				target.installId === installId &&
				Boolean(target.packagePath)
		);
	}

	function selectSource(installId: string) {
		sourceInstallId = installId;
		destinationInstallIds = destinationInstallIds.filter((id) => id !== installId);
		selectedPluginIds = selectedPluginIds.filter((pluginId) =>
			isPluginAvailable(pluginId, installId)
		);
	}

	function toggleDestination(installId: string, checked: boolean) {
		if (installId === sourceInstallId) return;
		destinationInstallIds = checked
			? [...new Set([...destinationInstallIds, installId])]
			: destinationInstallIds.filter((id) => id !== installId);
	}

	function setAllDestinations(selected: boolean) {
		destinationInstallIds = selected
			? destinationInstalls.map((install: HoudiniInstall) => install.id)
			: [];
	}

	function togglePlugin(pluginId: string, checked: boolean) {
		if (!isPluginAvailable(pluginId)) return;
		selectedPluginIds = checked
			? [...new Set([...selectedPluginIds, pluginId])]
			: selectedPluginIds.filter((id) => id !== pluginId);
	}

	function setAllAvailablePlugins(selected: boolean) {
		selectedPluginIds = selected ? sourcePlugins.map((plugin: PluginRecord) => plugin.id) : [];
	}

	function submitMigration() {
		if (!canMigrate) return;
		onMigrate({
			action: 'migrate-configs',
			sourceInstallId: activeSourceInstallId,
			destinationInstallIds: [...destinationInstallIds],
			pluginIds: [...selectedPluginIds]
		});
	}

	function closeDialog() {
		if (migrationState !== 'working') onClose();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && migrationState !== 'working') {
			event.stopPropagation();
			onClose();
		}
	}
</script>

<div class="migrator-backdrop" role="presentation" onclick={closeDialog} onkeydown={handleKeydown}>
	<dialog
		open
		class="migrator-dialog"
		aria-labelledby="plugin-migrator-title"
		aria-describedby="plugin-migrator-description"
		aria-busy={migrationState === 'working'}
		onclick={(event) => event.stopPropagation()}
		onkeydown={handleKeydown}
	>
		<div class="migrator-header">
			<div>
				<h2 id="plugin-migrator-title">Plugin Migrator</h2>
				<p id="plugin-migrator-description">
					Copy selected Houdini package configs from one install to other installs.
				</p>
			</div>
			<button
				type="button"
				class="dialog-close-button"
				aria-label="Close Plugin Migrator dialog"
				disabled={migrationState === 'working'}
				onclick={closeDialog}
			>
				<X size={18} strokeWidth={1.8} aria-hidden="true" />
			</button>
		</div>

		<div class="migrator-content">
			<div class="migrator-controls">
				<label class="migrator-field">
					<span>Source Houdini install</span>
					<select
						value={activeSourceInstallId}
						disabled={migrationState === 'working' || !installs.length}
						onchange={(event) => selectSource((event.currentTarget as HTMLSelectElement).value)}
					>
						<option value="" disabled>Choose an install</option>
						{#each installs as install (install.id)}
							<option value={install.id}>{install.label} · {install.version}</option>
						{/each}
					</select>
				</label>

				<fieldset class="migrator-fieldset">
					<legend>
						<span>Destination installs</span>
						<span class="selection-actions">
							<button
								type="button"
								class="selection-link"
								disabled={migrationState === 'working' || !destinationInstalls.length}
								onclick={() => setAllDestinations(true)}>All</button
							>
							<button
								type="button"
								class="selection-link"
								disabled={migrationState === 'working' || !destinationInstallIds.length}
								onclick={() => setAllDestinations(false)}>Clear</button
							>
						</span>
					</legend>
					<div class="install-options">
						{#each destinationInstalls as install (install.id)}
							<label class="check-row">
								<input
									type="checkbox"
									checked={destinationInstallIds.includes(install.id)}
									disabled={migrationState === 'working'}
									onchange={(event) =>
										toggleDestination(
											install.id,
											(event.currentTarget as HTMLInputElement).checked
										)}
								/>
								<span>
									<strong>{install.label}</strong>
									<small>{install.version} · {install.platform}</small>
								</span>
							</label>
						{:else}
							<p class="empty-copy">Choose a source with another install available.</p>
						{/each}
					</div>
				</fieldset>
			</div>

			<div class="plugin-picker">
				<div class="plugin-picker-header">
					<div>
						<h3>Plugins to copy</h3>
						<p>
							{selectedPluginIds.length} selected · {sourcePlugins.length} available from source
						</p>
					</div>
					<div class="picker-actions">
						<button
							type="button"
							class="selection-link"
							disabled={migrationState === 'working' || !sourcePlugins.length}
							onclick={() => setAllAvailablePlugins(!allAvailableSelected)}
						>
							{allAvailableSelected ? 'Clear all' : 'Select all available'}
						</button>
					</div>
				</div>
				<label class="plugin-search">
					<span class="sr-only">Filter plugins</span>
					<Search size={15} strokeWidth={1.8} aria-hidden="true" />
					<input bind:value={pluginQuery} type="search" placeholder="Filter plugins" />
				</label>
				<div class="plugin-list">
					{#each visiblePlugins as plugin (plugin.id)}
						{@const available = isPluginAvailable(plugin.id)}
						<label class:plugin-unavailable={!available} class="plugin-row">
							<input
								type="checkbox"
								checked={selectedPluginIds.includes(plugin.id)}
								disabled={migrationState === 'working' || !available}
								onchange={(event) =>
									togglePlugin(plugin.id, (event.currentTarget as HTMLInputElement).checked)}
							/>
							<span class="plugin-row-copy">
								<strong>{plugin.name}</strong>
								<small>{plugin.packageFile}</small>
							</span>
							{#if available}
								<Check class="availability-icon" size={15} strokeWidth={2} aria-label="Available" />
							{:else}
								<small class="unavailable-label">Unavailable in source</small>
							{/if}
						</label>
					{:else}
						<p class="empty-copy">No plugins match this filter.</p>
					{/each}
				</div>
			</div>
		</div>

		<div class="migrator-warning">
			<strong>Existing destination configs will be overwritten.</strong>
			<span
				>Only the selected package JSON files are copied; plugin source folders are unchanged.</span
			>
		</div>

		{#if message}
			<p
				class:error-message={migrationState === 'error'}
				class:success-message={migrationState === 'success'}
				class="migrator-message"
				role="status"
				aria-live="polite"
			>
				{message}
			</p>
		{/if}

		<div class="migrator-footer">
			<span class="migration-summary">
				{selectedPluginIds.length} plugin{selectedPluginIds.length === 1 ? '' : 's'} ·
				{destinationInstallIds.length} destination{destinationInstallIds.length === 1 ? '' : 's'}
			</span>
			<button
				type="button"
				class="secondary-action"
				disabled={migrationState === 'working'}
				onclick={closeDialog}
			>
				{migrationState === 'success' ? 'Done' : 'Cancel'}
			</button>
			<button type="button" class="primary-action" disabled={!canMigrate} onclick={submitMigration}>
				<Copy size={16} strokeWidth={1.8} aria-hidden="true" />
				{migrationState === 'working' ? 'Copying...' : 'Copy plugin configs'}
				<ArrowRight size={16} strokeWidth={1.8} aria-hidden="true" />
			</button>
		</div>
	</dialog>
</div>

<style>
	.migrator-backdrop {
		position: fixed;
		z-index: 9000;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 24px;
		background: rgba(4, 8, 7, 0.78);
	}

	.migrator-dialog {
		position: static;
		display: flex;
		width: min(900px, 100%);
		max-height: min(860px, calc(100dvh - 48px));
		margin: 0;
		padding: 0;
		flex-direction: column;
		border: 1px solid rgba(211, 232, 225, 0.17);
		border-radius: 8px;
		background: #182421;
		box-shadow: 0 24px 70px rgba(0, 0, 0, 0.48);
		color: var(--text);
	}

	.migrator-header,
	.migrator-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 18px 20px;
	}

	.migrator-header {
		border-bottom: 1px solid var(--line);
	}

	.migrator-header h2,
	.plugin-picker h3 {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
	}

	.migrator-header p:last-child,
	.plugin-picker-header p {
		margin: 5px 0 0;
		color: var(--text-muted);
		font-size: 12px;
		line-height: 1.45;
	}

	.dialog-close-button {
		display: grid;
		width: 30px;
		height: 30px;
		flex: 0 0 auto;
		place-items: center;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: rgba(255, 255, 255, 0.035);
		color: var(--text-muted);
		cursor: pointer;
	}

	.dialog-close-button:hover:not(:disabled),
	.dialog-close-button:focus-visible {
		border-color: #df6d58;
		color: #ffb09f;
		outline: none;
	}

	.migrator-content {
		display: grid;
		min-height: 0;
		grid-template-columns: minmax(230px, 0.8fr) minmax(0, 1.2fr);
		gap: 18px;
		overflow: auto;
		padding: 18px 20px;
	}

	.migrator-controls,
	.plugin-picker {
		min-width: 0;
	}

	.migrator-controls {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	.migrator-field,
	.migrator-fieldset {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 0;
		padding: 0;
		border: 0;
	}

	.migrator-field > span,
	.migrator-fieldset legend,
	.plugin-picker-header h3 {
		color: var(--text-dim);
		font-size: 11px;
		font-weight: 600;
	}

	.migrator-field select,
	.plugin-search {
		width: 100%;
		min-height: 34px;
		padding: 7px 9px;
		border: 1px solid var(--line-strong);
		border-radius: 5px;
		background: rgba(255, 255, 255, 0.045);
		color: var(--text);
		font: inherit;
		font-size: 12px;
	}

	.migrator-field select:focus-visible,
	.plugin-search:focus-within {
		border-color: #399b82;
		outline: 2px solid rgba(57, 155, 130, 0.2);
		outline-offset: 1px;
	}

	.migrator-fieldset legend {
		display: flex;
		width: 100%;
		align-items: center;
		justify-content: space-between;
		padding: 0;
	}

	.selection-actions,
	.picker-actions {
		display: flex;
		gap: 8px;
	}

	.selection-link {
		padding: 0;
		border: 0;
		background: transparent;
		color: #7dc6ae;
		cursor: pointer;
		font: inherit;
		font-size: 10px;
		font-weight: 600;
	}

	.selection-link:hover:not(:disabled),
	.selection-link:focus-visible {
		color: #b1ebd6;
		outline: none;
		text-decoration: underline;
	}

	.selection-link:disabled {
		cursor: default;
		opacity: 0.45;
	}

	.install-options {
		display: flex;
		max-height: 240px;
		flex-direction: column;
		gap: 6px;
		overflow: auto;
	}

	.check-row,
	.plugin-row {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 42px;
		padding: 7px 8px;
		border: 1px solid rgba(211, 232, 225, 0.08);
		border-radius: 5px;
		background: rgba(255, 255, 255, 0.025);
		cursor: pointer;
	}

	.check-row:hover,
	.plugin-row:hover:not(.plugin-unavailable) {
		border-color: rgba(57, 155, 130, 0.45);
		background: rgba(57, 155, 130, 0.08);
	}

	.check-row input,
	.plugin-row input {
		accent-color: #399b82;
		flex: 0 0 auto;
	}

	.check-row span,
	.plugin-row-copy {
		display: flex;
		min-width: 0;
		flex: 1;
		flex-direction: column;
		gap: 2px;
	}

	.check-row strong,
	.plugin-row strong {
		font-size: 12px;
		font-weight: 600;
	}

	.check-row small,
	.plugin-row small {
		color: var(--text-muted);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
	}

	.plugin-picker {
		display: flex;
		min-height: 0;
		flex-direction: column;
	}

	.plugin-picker-header {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 12px;
	}

	.plugin-search {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
		color: var(--text-muted);
	}

	.plugin-search input {
		width: 100%;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: 12px;
	}

	.plugin-search input::placeholder {
		color: #71827c;
	}

	.plugin-list {
		display: flex;
		min-height: 170px;
		flex-direction: column;
		gap: 6px;
		overflow: auto;
		padding-right: 2px;
	}

	.plugin-unavailable {
		cursor: default;
		opacity: 0.5;
	}

	.unavailable-label {
		flex: 0 0 auto;
		text-align: right;
	}

	.empty-copy {
		margin: 8px 0;
		color: var(--text-muted);
		font-size: 11px;
		line-height: 1.4;
	}

	.migrator-warning {
		display: flex;
		gap: 8px;
		margin: 0 20px;
		padding: 10px 12px;
		border-left: 2px solid #d39b38;
		background: rgba(211, 155, 56, 0.1);
		color: #d9b86e;
		font-size: 11px;
		line-height: 1.4;
	}

	.migrator-warning strong {
		color: #f0cf84;
		font-weight: 600;
	}

	.migrator-message {
		margin: 12px 20px 0;
		font-size: 11px;
		line-height: 1.4;
	}

	.success-message {
		color: #7dc6ae;
	}

	.error-message {
		color: #ff9c88;
	}

	.migrator-footer {
		margin-top: 16px;
		border-top: 1px solid var(--line);
	}

	.migration-summary {
		margin-right: auto;
		color: var(--text-muted);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
	}

	.secondary-action,
	.primary-action {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		min-height: 32px;
		padding: 7px 10px;
		border-radius: 5px;
		cursor: pointer;
		font: inherit;
		font-size: 11px;
		font-weight: 600;
	}

	.secondary-action {
		border: 1px solid var(--line-strong);
		background: transparent;
		color: var(--text-muted);
	}

	.primary-action {
		border: 1px solid #399b82;
		background: #2e806c;
		color: #f1fff9;
	}

	.secondary-action:hover:not(:disabled),
	.secondary-action:focus-visible {
		border-color: #7dc6ae;
		color: var(--text);
		outline: none;
	}

	.primary-action:hover:not(:disabled),
	.primary-action:focus-visible {
		background: #399b82;
		outline: none;
	}

	.secondary-action:disabled,
	.primary-action:disabled {
		cursor: wait;
		opacity: 0.55;
	}

	@media (max-width: 720px) {
		.migrator-backdrop {
			padding: 12px;
		}

		.migrator-dialog {
			max-height: calc(100dvh - 24px);
		}

		.migrator-content {
			grid-template-columns: 1fr;
		}

		.install-options,
		.plugin-list {
			max-height: 220px;
		}

		.migrator-footer {
			flex-wrap: wrap;
		}

		.migration-summary {
			width: 100%;
		}
	}
</style>
