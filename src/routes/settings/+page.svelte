<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { ArrowLeft, ChevronDown, ChevronUp, Settings } from '@lucide/svelte';
	import {
		DEFAULT_ACTIVITY_HISTORY_RETENTION,
		MAX_ACTIVITY_HISTORY_RETENTION,
		MIN_ACTIVITY_HISTORY_RETENTION,
		getActivityHistoryRetention,
		initializeActivitySettings,
		setActivityHistoryRetention
	} from '$lib/settings/activity-settings.svelte';

	let activityHistoryRetention = $state(DEFAULT_ACTIVITY_HISTORY_RETENTION);
	let editingRetention = $state(false);
	let retentionDraft = $state('');

	onMount(() => {
		initializeActivitySettings();
		activityHistoryRetention = getActivityHistoryRetention();
	});

	function beginEditingRetention() {
		retentionDraft = String(activityHistoryRetention);
		editingRetention = true;
	}

	function commitRetention() {
		if (!editingRetention) return;
		activityHistoryRetention = setActivityHistoryRetention(Number(retentionDraft));
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
	}

	function selectRetentionInput(element: HTMLElement) {
		if (!(element instanceof HTMLInputElement)) return;
		element.focus();
		element.select();
	}

	function handleRetentionKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			commitRetention();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelRetention();
		}
	}
</script>

<svelte:head>
	<title>HPM / Settings</title>
	<meta name="description" content="Configure Houdini Package Manager preferences." />
</svelte:head>

<div class="settings-page">
	<header class="settings-header">
		<a class="brand-link" href={resolve('/')} aria-label="Back to HPM home">
			<ArrowLeft size={17} strokeWidth={1.8} aria-hidden="true" />
			<span>Library</span>
		</a>
		<div class="settings-heading">
			<Settings size={18} strokeWidth={1.8} aria-hidden="true" />
			<span>HPM preferences</span>
		</div>
	</header>

	<main class="settings-main">
		<div class="settings-intro">
			<h1>Settings</h1>
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
							aria-label="Events to retain"
							aria-describedby="activity-history-help"
							onblur={commitRetention}
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
						aria-label={`Edit history retention, currently ${activityHistoryRetention} events`}
						title="Edit history retention"
						onclick={beginEditingRetention}
					>
						{activityHistoryRetention}
					</button>
				{/if}
			</div>
		</section>
	</main>
</div>

<style>
	.settings-page {
		min-height: 100dvh;
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
		color: var(--text);
		text-decoration: none;
	}

	.brand-link:hover {
		color: #78d5b7;
	}

	.settings-heading {
		color: var(--text-muted);
	}

	.settings-main {
		padding-top: clamp(52px, 10vw, 104px);
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

	.section-heading,
	.setting-control {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 24px;
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

		.setting-control {
			flex-direction: column;
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
