<script lang="ts">
	import { Activity, CheckCircle2, ChevronRight, CircleAlert, Clock3, X } from '@lucide/svelte';
	import type { ActivityEvent, ActivityEventKind, ActivityEventStatus } from './types';

	let { events } = $props<{ events: ActivityEvent[] }>();
	let dialogOpen = $state(false);
	let latestEvent = $derived(events[0]);

	function formatTime(timestamp: string) {
		return new Date(timestamp).toLocaleString();
	}

	function kindLabel(kind: ActivityEventKind) {
		return {
			scan: 'Scan',
			sync: 'Sync',
			plugin: 'Plugin',
			hconfig: 'Hconfig',
			install: 'Install',
			migration: 'Migration',
			config: 'Config'
		}[kind];
	}

	function statusLabel(status: ActivityEventStatus) {
		return status === 'success' ? 'Complete' : status === 'cancelled' ? 'Cancelled' : 'Failed';
	}

	function closeDialog() {
		dialogOpen = false;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !dialogOpen) return;
		event.stopPropagation();
		closeDialog();
	}
</script>

<button
	type="button"
	class="activity-latest"
	aria-haspopup="dialog"
	aria-expanded={dialogOpen}
	onclick={() => (dialogOpen = true)}
>
	<span class="activity-latest-mark" aria-hidden="true">
		{#if latestEvent}
			{#if latestEvent.status === 'success'}
				<CheckCircle2 size={16} strokeWidth={1.9} />
			{:else if latestEvent.status === 'error'}
				<CircleAlert size={16} strokeWidth={1.9} />
			{:else}
				<Clock3 size={16} strokeWidth={1.9} />
			{/if}
		{:else}
			<Activity size={16} strokeWidth={1.9} />
		{/if}
	</span>
	<span class="activity-latest-copy">
		<strong>{latestEvent?.title ?? 'No activity recorded yet'}</strong>
		{#if latestEvent?.detail}
			<span> · {latestEvent.detail}</span>
		{/if}
	</span>
	{#if latestEvent}
		<time datetime={latestEvent.timestamp}>{formatTime(latestEvent.timestamp)}</time>
	{/if}
	<ChevronRight class="activity-latest-arrow" size={16} strokeWidth={1.8} aria-hidden="true" />
</button>

<svelte:window onkeydown={handleKeydown} />

{#if dialogOpen}
	<div class="activity-backdrop" role="presentation">
		<button
			type="button"
			class="activity-dismiss"
			aria-label="Close activity history"
			onclick={closeDialog}
		></button>
		<dialog open class="activity-dialog" aria-labelledby="activity-dialog-title">
			<div class="activity-dialog-header">
				<div>
					<h2 id="activity-dialog-title">Activity history</h2>
					<p>{events.length} recorded event{events.length === 1 ? '' : 's'}</p>
				</div>
				<button
					type="button"
					class="activity-close-button"
					aria-label="Close activity history"
					onclick={closeDialog}
				>
					<X size={18} strokeWidth={1.8} aria-hidden="true" />
				</button>
			</div>
			{#if events.length}
				<ol class="activity-list">
					{#each events as event (event.id)}
						<li class={['activity-entry', `is-${event.status}`]}>
							<span class="activity-entry-mark" aria-hidden="true">
								{#if event.status === 'success'}
									<CheckCircle2 size={17} strokeWidth={1.9} />
								{:else if event.status === 'error'}
									<CircleAlert size={17} strokeWidth={1.9} />
								{:else}
									<Clock3 size={17} strokeWidth={1.9} />
								{/if}
							</span>
							<div class="activity-entry-copy">
								<div class="activity-entry-heading">
									<strong>{event.title}</strong>
									<span>{kindLabel(event.kind)} · {statusLabel(event.status)}</span>
								</div>
								<p>{event.detail}</p>
								<time datetime={event.timestamp}>{formatTime(event.timestamp)}</time>
							</div>
						</li>
					{/each}
				</ol>
			{:else}
				<p class="activity-empty">Actions and scan results will appear here.</p>
			{/if}
		</dialog>
	</div>
{/if}

<style>
	.activity-latest {
		display: flex;
		width: 100%;
		min-width: 0;
		align-items: center;
		gap: 8px;
		padding: 8px 3px 0;
		border: 0;
		background: transparent;
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 12px;
		letter-spacing: 0.03em;
		text-align: left;
		cursor: pointer;
	}

	.activity-latest:hover,
	.activity-latest:focus-visible {
		color: var(--text);
		outline: none;
	}

	.activity-latest-mark {
		display: inline-flex;
		flex: 0 0 auto;
		color: #399b82;
	}

	.activity-latest:has(.activity-latest-mark) .activity-latest-mark {
		color: var(--text-muted);
	}

	.activity-latest-copy {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.activity-latest-copy strong {
		color: inherit;
		font-weight: 600;
	}

	.activity-latest time {
		flex: 0 0 auto;
		margin-left: auto;
		color: var(--text-muted);
		white-space: nowrap;
	}

	.activity-latest-arrow {
		flex: 0 0 auto;
		color: var(--text-muted);
	}

	.activity-backdrop {
		position: fixed;
		inset: 0;
		z-index: 9000;
		display: grid;
		place-items: center;
		padding: 24px;
		background: rgba(9, 14, 15, 0.72);
	}

	.activity-dismiss {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
		background: transparent;
		cursor: default;
	}

	.activity-dialog {
		position: relative;
		z-index: 1;
		display: flex;
		width: min(760px, 100%);
		max-height: min(780px, calc(100dvh - 48px));
		flex-direction: column;
		overflow: hidden;
		padding: 22px;
		border: 1px solid var(--line-strong);
		border-radius: 8px;
		background: #182224;
		box-shadow: 0 22px 70px rgba(0, 0, 0, 0.42);
	}

	.activity-dialog-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 20px;
	}

	.activity-dialog-header h2 {
		margin: 0;
		font-size: 22px;
		font-weight: 600;
	}

	.activity-dialog-header p {
		margin: 7px 0 0;
		color: var(--text-muted);
		font-size: 14px;
	}

	.activity-close-button {
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

	.activity-close-button:hover,
	.activity-close-button:focus-visible {
		border-color: #df6d58;
		color: #ffb09f;
		outline: none;
	}

	.activity-list {
		display: flex;
		min-height: 0;
		flex-direction: column;
		gap: 8px;
		margin: 20px 0 0;
		overflow: auto;
		padding: 0 4px 2px 0;
		list-style: none;
	}

	.activity-entry {
		display: flex;
		gap: 11px;
		padding: 11px 12px;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: rgba(0, 0, 0, 0.14);
	}

	.activity-entry-mark {
		display: inline-flex;
		flex: 0 0 auto;
		padding-top: 1px;
		color: #399b82;
	}

	.activity-entry.is-error .activity-entry-mark {
		color: #df6d58;
	}

	.activity-entry.is-cancelled .activity-entry-mark {
		color: #d39b38;
	}

	.activity-entry-copy {
		min-width: 0;
		flex: 1;
	}

	.activity-entry-heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}

	.activity-entry-heading strong {
		color: var(--text);
		font-size: 13px;
		font-weight: 600;
	}

	.activity-entry-heading span,
	.activity-entry-copy time {
		color: var(--text-muted);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 11px;
		white-space: nowrap;
	}

	.activity-entry-copy p {
		margin: 4px 0 0;
		color: var(--text-dim);
		font-size: 12px;
		line-height: 1.45;
		word-break: break-word;
	}

	.activity-entry-copy time {
		display: block;
		margin-top: 6px;
	}

	.activity-empty {
		margin: 20px 0 0;
		color: var(--text-muted);
		font-size: 13px;
	}

	@media (max-width: 600px) {
		.activity-latest time {
			display: none;
		}

		.activity-dialog {
			max-height: calc(100dvh - 24px);
			padding: 17px;
		}

		.activity-entry-heading {
			align-items: flex-start;
			flex-direction: column;
			gap: 3px;
		}
	}
</style>
