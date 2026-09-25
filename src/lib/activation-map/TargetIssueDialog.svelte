<script lang="ts">
	import { Cog, FileCog, X } from '@lucide/svelte';
	import type { ActivationTarget } from './types';
	import type { TargetIssueDetails } from './target-issue-dialog';

	let { details, actionsDisabled, onClose, onOpenConfig, onOpenEditor } = $props<{
		details: TargetIssueDetails;
		actionsDisabled: boolean;
		onClose: () => void;
		onOpenConfig: (installId: string) => void;
		onOpenEditor: (installId: string, target: ActivationTarget) => void;
	}>();

	function openConfig() {
		onOpenConfig(details.installId);
		onClose();
	}

	function openEditor() {
		onOpenEditor(details.installId, details.target);
		onClose();
	}
</script>

<div class="issues-dialog-backdrop">
	<button
		type="button"
		class="issues-dialog-dismiss"
		aria-label="Close target issue dialog"
		onclick={onClose}
	></button>
	<dialog open class="issues-dialog target-issue-dialog" aria-labelledby="target-issue-title">
		<div class="issues-dialog-header">
			<div>
				<h2 id="target-issue-title">{details.summary}</h2>
				<p>{details.installLabel} / {details.packageFile}</p>
			</div>
			<button
				type="button"
				class="dialog-close-button"
				aria-label="Close target issue dialog"
				onclick={onClose}
			>
				<X size={18} strokeWidth={1.8} aria-hidden="true" />
			</button>
		</div>
		<ul class="target-issue-messages">
			{#each details.messages as message, index (`${message}-${index}`)}
				<li>
					<span class="target-issue-number" aria-hidden="true">{index + 1}</span>
					<span>{message}</span>
				</li>
			{/each}
		</ul>
		<div class="target-issue-actions">
			<button
				type="button"
				class="dialog-secondary-button"
				aria-label="Open config"
				disabled={actionsDisabled}
				onclick={openConfig}
				data-tooltip="Open JSON config"
			>
				<FileCog size={18} strokeWidth={1.8} aria-hidden="true" />
			</button>
			<button
				type="button"
				class="dialog-primary-button"
				aria-label="Live JSON Editor"
				disabled={actionsDisabled}
				onclick={openEditor}
				data-tooltip="Open live JSON editor"
			>
				<Cog size={18} strokeWidth={1.8} aria-hidden="true" />
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

	.target-issue-messages {
		max-height: min(260px, 35dvh);
		margin: 20px 0;
		overflow: auto;
		display: grid;
		gap: 7px;
		padding: 10px;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: rgba(0, 0, 0, 0.14);
		list-style: none;
	}

	.target-issue-messages li {
		display: grid;
		grid-template-columns: 22px minmax(0, 1fr);
		align-items: start;
		gap: 9px;
		padding: 9px 10px;
		border: 1px solid rgba(211, 155, 56, 0.2);
		border-radius: 4px;
		background: rgba(211, 155, 56, 0.08);
		color: #e7d6ae;
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 12px;
		line-height: 1.5;
		overflow-wrap: anywhere;
	}

	.target-issue-number {
		display: inline-grid;
		width: 22px;
		height: 22px;
		place-items: center;
		border: 1px solid rgba(211, 155, 56, 0.45);
		border-radius: 50%;
		background: rgba(211, 155, 56, 0.16);
		color: #f0c96f;
		font-family: inherit;
		font-size: 12px;
		font-weight: 700;
	}

	.target-issue-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}

	.dialog-secondary-button,
	.dialog-primary-button {
		min-height: 34px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 5px;
		font: inherit;
		font-size: 12px;
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
</style>
