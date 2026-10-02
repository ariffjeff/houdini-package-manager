<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		ArrowLeft,
		Check,
		ChevronDown,
		ChevronUp,
		RotateCcw,
		Save,
		Settings
	} from '@lucide/svelte';
	import {
		DEFAULT_ACTIVITY_HISTORY_RETENTION,
		MAX_ACTIVITY_HISTORY_RETENTION,
		MIN_ACTIVITY_HISTORY_RETENTION,
		getActivityHistoryRetention,
		initializeActivitySettings,
		normalizeActivityHistoryRetention,
		recordActivitySettingsSaved,
		setActivityHistoryRetention
	} from '$lib/settings/activity-settings.svelte';
	import type { HpmLocalDataKind } from '$lib/settings/local-storage';

	let {
		onClose = null,
		onActivitySettingsSaved = null,
		onClearLocalData = null
	} = $props<{
		onClose?: (() => void) | null;
		onActivitySettingsSaved?: (() => void) | null;
		onClearLocalData?:
			((kind: HpmLocalDataKind | 'discovery-cache') => void | Promise<void>) | null;
	}>();

	let activityHistoryRetention = $state(DEFAULT_ACTIVITY_HISTORY_RETENTION);
	let editingRetention = $state(false);
	let retentionDraft = $state(String(DEFAULT_ACTIVITY_HISTORY_RETENTION));
	let changesSaved = $state(false);
	let isClearingLocalData = $state(false);
	let clearLocalDataError = $state('');
	let hasUnsavedChanges = $derived(
		normalizeActivityHistoryRetention(Number(retentionDraft)) !== activityHistoryRetention
	);
	let displayedRetention = $derived(normalizeActivityHistoryRetention(Number(retentionDraft)));
	let isRetentionNonDefault = $derived(displayedRetention !== DEFAULT_ACTIVITY_HISTORY_RETENTION);

	onMount(() => {
		initializeActivitySettings();
		activityHistoryRetention = getActivityHistoryRetention();
		retentionDraft = String(activityHistoryRetention);
	});

	function beginEditingRetention() {
		if (!hasUnsavedChanges) retentionDraft = String(activityHistoryRetention);
		editingRetention = true;
		changesSaved = false;
	}

	function finishEditingRetention() {
		if (!editingRetention) return;
		retentionDraft = String(normalizeActivityHistoryRetention(Number(retentionDraft)));
		editingRetention = false;
	}

	function cancelRetention() {
		editingRetention = false;
	}

	function adjustRetention(delta: number) {
		const currentValue = Number(retentionDraft);
		const nextValue = Number.isFinite(currentValue) ? currentValue + delta : delta;
		retentionDraft = String(
			Math.min(MAX_ACTIVITY_HISTORY_RETENTION, Math.max(MIN_ACTIVITY_HISTORY_RETENTION, nextValue))
		);
		changesSaved = false;
	}

	function saveChanges() {
		finishEditingRetention();
		activityHistoryRetention = setActivityHistoryRetention(Number(retentionDraft));
		retentionDraft = String(activityHistoryRetention);
		recordActivitySettingsSaved(activityHistoryRetention);
		onActivitySettingsSaved?.();
		changesSaved = true;
	}

	function revertChanges() {
		if (!hasUnsavedChanges) return;
		retentionDraft = String(activityHistoryRetention);
		editingRetention = false;
		changesSaved = false;
	}

	function resetRetentionToDefault() {
		if (!isRetentionNonDefault) return;
		retentionDraft = String(DEFAULT_ACTIVITY_HISTORY_RETENTION);
		editingRetention = false;
		changesSaved = false;
	}

	function selectRetentionInput(element: HTMLElement) {
		if (!(element instanceof HTMLInputElement)) return;
		element.focus();
		element.select();
	}

	function handleRetentionKeydown(event: KeyboardEvent) {
		event.stopPropagation();
		if (event.key === 'Enter') {
			event.preventDefault();
			finishEditingRetention();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelRetention();
		}
	}

	async function clearLocalData(kind: HpmLocalDataKind | 'discovery-cache', label: string) {
		if (!onClearLocalData || isClearingLocalData) return;
		if (!window.confirm(`Clear ${label}? This cannot be undone.`)) return;

		isClearingLocalData = true;
		clearLocalDataError = '';
		try {
			await onClearLocalData(kind);
		} catch (error) {
			clearLocalDataError = error instanceof Error ? error.message : String(error);
		} finally {
			isClearingLocalData = false;
		}
	}
</script>

<div class="settings-page">
	<header class="settings-header">
		{#if onClose}
			<button type="button" class="brand-link" aria-label="Close settings" onclick={onClose}>
				<ArrowLeft size={17} strokeWidth={1.8} aria-hidden="true" />
				<span>Library</span>
			</button>
		{:else}
			<a class="brand-link" href={resolve('/')} aria-label="Back to HPM home">
				<ArrowLeft size={17} strokeWidth={1.8} aria-hidden="true" />
				<span>Library</span>
			</a>
		{/if}
		<div class="settings-heading">
			<Settings size={18} strokeWidth={1.8} aria-hidden="true" />
			<span>HPM preferences</span>
		</div>
		<div class="settings-actions">
			<button
				type="button"
				class="revert-button"
				disabled={!hasUnsavedChanges}
				onclick={revertChanges}
			>
				<RotateCcw size={15} strokeWidth={1.8} aria-hidden="true" />
				Revert changes
			</button>
			<button type="button" class="save-button" disabled={!hasUnsavedChanges} onclick={saveChanges}>
				{#if changesSaved}
					<Check size={15} strokeWidth={2} aria-hidden="true" />
					Saved
				{:else}
					<Save size={15} strokeWidth={1.8} aria-hidden="true" />
					Save changes
				{/if}
			</button>
		</div>
	</header>

	<main class="settings-main">
		<div class="settings-intro">
			<h1 id="settings-dialog-title">Settings</h1>
		</div>

		<section class="settings-section" aria-labelledby="activity-settings-title">
			<div class="section-heading">
				<div>
					<h2 id="activity-settings-title">History retention</h2>
				</div>
			</div>
			<div class="setting-control">
				<div>
					<p id="activity-history-help">
						Activity history is kept across HPM restarts and page refreshes. Older entries are
						removed when this limit is applied. Set this to 0 to keep history only for the current
						session.
					</p>
				</div>
				<div class="retention-control">
					{#if isRetentionNonDefault}
						<button
							type="button"
							class="default-indicator is-modified"
							aria-label="Reset history retention to default"
							title="Reset to default"
							onclick={resetRetentionToDefault}
						>
							<span class="indicator-dot" aria-hidden="true"></span>
						</button>
					{:else}
						<span class="default-indicator" aria-label="History retention is set to default">
							<span class="indicator-dot" aria-hidden="true"></span>
						</span>
					{/if}
					{#if editingRetention}
						<div class="retention-editor">
							<input
								{@attach selectRetentionInput}
								id="activity-history-retention"
								type="number"
								min={MIN_ACTIVITY_HISTORY_RETENTION}
								max={MAX_ACTIVITY_HISTORY_RETENTION}
								step="1"
								bind:value={retentionDraft}
								class:has-unsaved={hasUnsavedChanges}
								aria-label="Events to retain"
								aria-describedby="activity-history-help"
								onblur={finishEditingRetention}
								oninput={() => (changesSaved = false)}
								onfocus={(event) => (event.currentTarget as HTMLInputElement).select()}
								onkeydown={handleRetentionKeydown}
							/>
							<div class="retention-stepper" aria-label="Adjust events to retain">
								<button
									type="button"
									aria-label="Increase events to retain"
									onmousedown={(event) => {
										event.preventDefault();
										adjustRetention(1);
									}}
								>
									<ChevronUp size={13} strokeWidth={2} aria-hidden="true" />
								</button>
								<button
									type="button"
									aria-label="Decrease events to retain"
									onmousedown={(event) => {
										event.preventDefault();
										adjustRetention(-1);
									}}
								>
									<ChevronDown size={13} strokeWidth={2} aria-hidden="true" />
								</button>
							</div>
						</div>
					{:else}
						<button
							type="button"
							class="retention-value"
							class:has-unsaved={hasUnsavedChanges}
							aria-label={`Edit history retention, currently ${displayedRetention} events`}
							title="Edit history retention"
							onclick={beginEditingRetention}
						>
							{displayedRetention}
						</button>
					{/if}
				</div>
			</div>
		</section>

		<section class="settings-section danger-section" aria-labelledby="local-data-title">
			<div class="section-heading">
				<div>
					<h2 id="local-data-title">Cache and local data</h2>
				</div>
			</div>
			<div class="setting-control local-data-control">
				<p>
					Clear individual HPM data categories, or remove everything and start with a clean
					workspace.
				</p>
				<div class="clear-data-actions">
					<button
						type="button"
						class="clear-data-button"
						disabled={!onClearLocalData || isClearingLocalData}
						onclick={() => void clearLocalData('activity', 'activity history and preferences')}
					>
						Activity history
					</button>
					<button
						type="button"
						class="clear-data-button"
						disabled={!onClearLocalData || isClearingLocalData}
						onclick={() => void clearLocalData('pinned-updates', 'pinned update decisions')}
					>
						Pinned updates
					</button>
					<button
						type="button"
						class="clear-data-button"
						disabled={!onClearLocalData || isClearingLocalData}
						onclick={() => void clearLocalData('discovery-cache', 'the saved discovery snapshot')}
					>
						Discovery cache
					</button>
					<button
						type="button"
						class="clear-data-button clear-all-data-button"
						disabled={!onClearLocalData || isClearingLocalData}
						onclick={() => void clearLocalData('all', 'all HPM cache and local data')}
					>
						{isClearingLocalData ? 'Clearing...' : 'Clear all'}
					</button>
					{#if clearLocalDataError}
						<p class="clear-data-error" role="alert">{clearLocalDataError}</p>
					{/if}
				</div>
			</div>
		</section>
	</main>
</div>

<style>
	.settings-page {
		min-height: 100%;
		padding: 0 24px 64px;
	}
	.settings-header,
	.settings-main {
		width: min(920px, 100%);
		margin: 0 auto;
	}
	.settings-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
		padding: 24px 0;
		border-bottom: 1px solid var(--line);
	}
	.brand-link,
	.settings-heading {
		display: inline-flex;
		align-items: center;
		gap: 9px;
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 12px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.brand-link {
		border: 0;
		background: transparent;
		color: var(--text);
		text-decoration: none;
		cursor: pointer;
	}
	.brand-link:hover {
		color: #78d5b7;
	}
	.settings-heading {
		color: var(--text-muted);
	}
	.settings-main {
		padding-top: 12px;
	}
	.settings-intro {
		max-width: 620px;
	}
	h1,
	h2,
	p {
		margin-top: 0;
	}
	h1 {
		margin-bottom: 14px;
		font-size: clamp(20px, 6vw, 34px);
		font-weight: 500;
		letter-spacing: 0;
		line-height: 1;
	}
	.settings-section {
		padding: 24px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: linear-gradient(135deg, rgba(29, 53, 51, 0.72), rgba(22, 31, 34, 0.78));
		box-shadow: 0 18px 55px rgba(0, 0, 0, 0.2);
	}
	.danger-section {
		margin-top: 16px;
		border-color: rgba(223, 109, 88, 0.42);
	}
	.section-heading,
	.setting-control {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 24px;
	}
	.retention-control {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 8px;
	}
	.default-indicator {
		display: inline-flex;
		width: 28px;
		height: 28px;
		align-items: center;
		justify-content: center;
		flex: 0 0 auto;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--text-dim);
	}
	.indicator-dot {
		display: block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
	}
	button.default-indicator {
		color: var(--accent-orange);
		cursor: pointer;
	}
	button.default-indicator:hover,
	button.default-indicator:focus-visible {
		background: rgba(0, 0, 0, 0.5);
		outline: none;
	}
	h2 {
		margin-bottom: 0;
		font-size: 22px;
		font-weight: 500;
	}
	.setting-control {
		margin-top: 12px;
		align-items: end;
	}
	.setting-control p {
		max-width: 610px;
		margin-bottom: 0;
		color: var(--text-muted);
		font-size: 14px;
		line-height: 1.6;
	}
	.local-data-control {
		align-items: flex-start;
	}
	.clear-data-actions {
		display: flex;
		max-width: 430px;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 8px;
	}
	.clear-data-button {
		min-height: 36px;
		padding: 8px 13px;
		border: 1px solid rgba(223, 109, 88, 0.72);
		border-radius: 5px;
		background: rgba(223, 109, 88, 0.1);
		color: #ffb09f;
		font-size: 13px;
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
	}
	.clear-data-button:hover,
	.clear-data-button:focus-visible {
		background: rgba(223, 109, 88, 0.2);
		color: #ffd0c7;
		outline: none;
	}
	.clear-data-button:disabled {
		border-color: var(--line);
		background: rgba(255, 255, 255, 0.04);
		color: var(--text-dim);
		cursor: not-allowed;
	}
	.clear-all-data-button {
		border-color: #df6d58;
		background: rgba(223, 109, 88, 0.2);
	}
	.clear-data-error {
		max-width: 220px !important;
		margin: 8px 0 0 !important;
		color: #ffb09f !important;
		font-size: 12px !important;
	}
	.settings-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		margin: 24px 0 20px;
	}
	.settings-header .settings-actions {
		margin: 0;
		padding: 0;
		border: 0;
	}
	.save-button,
	.revert-button {
		display: inline-flex;
		min-height: 36px;
		align-items: center;
		gap: 8px;
		padding: 8px 13px;
		border-radius: 5px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}
	.save-button {
		border: 1px solid rgba(246, 102, 0, 0.72);
		background: rgba(246, 102, 0, 0.12);
		color: #ffb07c;
	}
	.save-button:hover,
	.save-button:focus-visible {
		background: rgba(246, 102, 0, 0.2);
		color: #ffd0ad;
		outline: none;
	}
	.save-button:disabled {
		border-color: var(--line);
		background: rgba(255, 255, 255, 0.04);
		color: var(--text-dim);
		cursor: not-allowed;
	}
	.revert-button {
		border: 1px solid var(--line-strong);
		background: transparent;
		color: var(--text-muted);
	}
	.revert-button:hover,
	.revert-button:focus-visible {
		border-color: #df6d58;
		color: #ffb09f;
		outline: none;
	}
	.revert-button:disabled {
		border-color: var(--line);
		color: var(--text-dim);
		cursor: not-allowed;
	}
	input,
	.retention-value {
		box-sizing: border-box;
		width: 100px;
		height: 39px;
		padding: 9px 10px;
		border: 1px solid var(--line-strong);
		border-radius: 5px;
		background: rgba(7, 14, 15, 0.48);
		color: var(--text);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 16px;
		line-height: 19px;
		text-align: right;
	}
	input[type='number'] {
		appearance: textfield;
	}
	input[type='number']::-webkit-inner-spin-button,
	input[type='number']::-webkit-outer-spin-button {
		margin: 0;
		appearance: none;
	}
	.retention-editor {
		display: flex;
		width: 132px;
		height: 39px;
		gap: 4px;
	}
	.retention-editor input {
		flex: 0 0 100px;
	}
	.retention-editor input:focus-visible {
		border-color: var(--accent-orange);
		outline: none;
		box-shadow: none;
	}
	.retention-stepper {
		display: flex;
		width: 28px;
		flex-direction: column;
		gap: 2px;
	}
	.retention-stepper button {
		display: flex;
		width: 28px;
		min-height: 0;
		flex: 1 1 0;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: 1px solid var(--line-strong);
		border-radius: 3px;
		background: rgba(7, 14, 15, 0.48);
		color: var(--text-muted);
		cursor: pointer;
	}
	.retention-stepper button:hover,
	.retention-stepper button:focus-visible {
		border-color: rgba(120, 213, 183, 0.62);
		color: var(--text);
		outline: none;
	}
	.retention-value {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		margin-right: 32px;
		cursor: text;
	}
	.retention-value:hover,
	.retention-value:focus-visible {
		border-color: rgba(120, 213, 183, 0.62);
		outline: none;
	}
	.retention-editor input.has-unsaved,
	.retention-value.has-unsaved {
		border-color: var(--accent-orange);
	}
	@media (max-width: 560px) {
		.settings-page {
			padding-right: 16px;
			padding-left: 16px;
		}
		.settings-header,
		.section-heading,
		.setting-control {
			align-items: flex-start;
		}
		.settings-heading {
			font-size: 0;
		}
		.settings-heading :global(svg) {
			width: 19px;
			height: 19px;
		}
		.settings-section {
			padding: 20px;
		}
		.settings-actions {
			justify-content: stretch;
		}
		.save-button {
			width: 100%;
			justify-content: center;
		}
		.settings-header .save-button,
		.settings-header .revert-button {
			width: auto;
		}
		.setting-control {
			flex-direction: column;
		}
		.local-data-control > div {
			width: 100%;
		}
		.clear-data-actions {
			max-width: none;
			justify-content: stretch;
		}
		.clear-data-button {
			width: 100%;
		}
		.retention-control {
			width: 100%;
		}
		input,
		.retention-value {
			width: 100%;
			text-align: left;
		}
		.retention-value {
			margin-right: 0;
			justify-content: flex-start;
		}
		.retention-editor {
			width: 100%;
		}
		.retention-editor input {
			flex: 1 1 auto;
			width: auto;
		}
	}
</style>
