<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import { Blocks, GitCommitHorizontal, Globe } from '@lucide/svelte';
	import houdiniBadge from '$lib/assets/houdini_badge_flat.svg';
	import type { ActivationNode } from './types';

	let { data, selected }: NodeProps<ActivationNode> = $props();

	function gitSyncLabel(hasRepository: boolean | undefined, timestamp: string | null | undefined) {
		if (!hasRepository) return 'No Git repo';
		if (!timestamp) return 'Git not synced';

		const elapsed = Date.now() - Date.parse(timestamp);
		if (!Number.isFinite(elapsed)) return 'Git sync time unavailable';
		if (elapsed < 60_000) return 'Git synced just now';

		const minutes = Math.floor(elapsed / 60_000);
		if (minutes < 60) return `Git synced ${minutes}m ago`;

		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `Git synced ${hours}h ago`;

		return `Git synced ${Math.floor(hours / 24)}d ago`;
	}

	function gitSyncDetails(timestamp: string) {
		return `Git metadata synced ${new Date(timestamp).toLocaleString()}`;
	}
</script>

<div
	class={['activation-node', `kind-${data.kind}`, selected && 'is-selected']}
	style:--node-accent={data.accent}
	role="group"
	aria-label={`${data.label}, ${data.statusLabel}${data.kind === 'plugin' ? `, ${gitSyncLabel(data.hasGitRepository, data.gitSyncedAt)}` : ''}`}
>
	<div class="node-accent"></div>
	<div class="node-content">
		<div class="node-header">
			{#if data.kind === 'plugin' && data.eyebrow === 'User package'}
				<span
					class="node-eyebrow node-eyebrow-icon"
					role="img"
					aria-label="User package"
					title="User package"
				>
					<Blocks class="node-blocks-icon" size={14} strokeWidth={1.9} aria-hidden="true" />
				</span>
			{:else if data.kind === 'install'}
				<span
					class="node-eyebrow node-eyebrow-icon"
					role="img"
					aria-label="Houdini install"
					title="Houdini install"
				>
					<img class="node-eyebrow-badge" src={houdiniBadge} alt="" aria-hidden="true" />
				</span>
			{:else}
				<span class="node-eyebrow">{data.eyebrow}</span>
			{/if}
			{#if data.kind === 'plugin' && data.activeInstallCount !== undefined}
				<span
					class={['node-state', 'node-install-count', `status-${data.status}`]}
					aria-label={`${data.activeInstallCount} of ${data.totalInstallCount ?? 0} installs enabled`}
				>
					<span>{data.activeInstallCount}</span>
					<img src={houdiniBadge} alt="" aria-hidden="true" />
				</span>
			{:else if data.kind === 'install' && data.totalPluginCount !== undefined}
				<span class="node-state node-install-count" aria-label={data.statusLabel}>
					<span>{data.totalPluginCount}</span>
					<Blocks class="node-blocks-icon" size={14} strokeWidth={1.9} aria-hidden="true" />
				</span>
			{:else if data.kind === 'official' && data.totalPluginCount !== undefined}
				<span class="node-state node-install-count" aria-label={data.statusLabel}>
					<span>{data.totalPluginCount}</span>
					<Blocks class="node-blocks-icon" size={14} strokeWidth={1.9} aria-hidden="true" />
				</span>
			{:else}
				<span class={['node-state', `status-${data.status}`]}>{data.statusLabel}</span>
			{/if}
		</div>
		<strong>{data.label}</strong>
		<span class="node-meta">{data.meta}</span>
	</div>
	{#if data.kind === 'plugin' && (data.hasGitRepository || data.hasRemoteRepository)}
		<div class="node-repository-indicators" aria-label="Repository indicators">
			{#if data.hasGitRepository}
				<span
					class="node-repository-indicator"
					role="img"
					aria-label={gitSyncLabel(data.hasGitRepository, data.gitSyncedAt)}
					title={data.gitSyncedAt ? gitSyncDetails(data.gitSyncedAt) : 'Git repository not synced'}
				>
					<GitCommitHorizontal size={15} strokeWidth={1.9} aria-hidden="true" />
				</span>
			{/if}
			{#if data.hasRemoteRepository}
				<span
					class="node-repository-indicator"
					role="img"
					aria-label="Remote repository"
					title="Remote repository"
				>
					<Globe size={15} strokeWidth={1.9} aria-hidden="true" />
				</span>
			{/if}
		</div>
	{/if}

	{#if data.kind === 'install'}
		<Handle type="target" position={Position.Left} />
	{:else}
		<Handle type="source" position={Position.Right} />
	{/if}
</div>

<style>
	.activation-node {
		position: relative;
		display: flex;
		width: 100%;
		height: 100%;
		overflow: hidden;
		border: 1px solid #202b2d;
		border-radius: 10px;
		background: #202b2d;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
		color: #edf4f1;
		transition:
			border-color 160ms ease,
			box-shadow 160ms ease,
			transform 160ms ease;
	}

	.activation-node.is-selected {
		border-color: rgb(255, 136, 0);
		box-shadow:
			0 10px 28px rgba(0, 0, 0, 0.32),
			0 0 0 3px color-mix(in srgb, var(--node-accent) 22%, transparent);
	}

	.node-accent {
		width: 6px;
		flex: 0 0 6px;
		background: var(--node-accent);
	}

	.node-content {
		display: flex;
		min-width: 0;
		flex: 1;
		flex-direction: column;
		justify-content: center;
		gap: 5px;
		padding: 14px 18px;
	}

	.node-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.node-eyebrow,
	.node-state,
	.node-meta {
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.node-eyebrow {
		color: #8ca099;
	}

	.node-eyebrow-icon {
		display: inline-flex;
		align-items: center;
	}

	.node-eyebrow-icon .node-blocks-icon {
		color: #8ca099;
	}

	.node-eyebrow-badge {
		width: 14px;
		height: 14px;
		object-fit: contain;
	}

	.node-state {
		color: #399b82;
	}

	.node-install-count {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		color: #9aa7a3;
		font-size: 18px;
		line-height: 0.5;
	}

	.node-install-count .node-blocks-icon {
		color: #9aa7a3;
	}

	.node-install-count img {
		width: 14px;
		height: 14px;
		object-fit: contain;
		filter: grayscale(1);
		opacity: 0.72;
	}

	.node-state.status-disabled,
	.node-state.status-missing {
		color: #ad7769;
	}

	.node-state.status-warning {
		color: #b37b18;
	}

	.node-state.status-incompatible {
		color: #c25443;
	}

	strong {
		font-size: 20px;
		font-weight: 650;
		letter-spacing: 0;
	}

	.node-meta {
		color: #91a39d;
		letter-spacing: 0.04em;
		text-transform: none;
	}

	.node-repository-indicators {
		position: absolute;
		right: 12px;
		bottom: 10px;
		display: flex;
		align-items: center;
		gap: 5px;
		color: #8de0c5;
	}

	.node-repository-indicator {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: inherit;
	}

	:global(.svelte-flow__handle) {
		width: 9px;
		height: 9px;
		border: 2px solid #202b2d;
		background: var(--node-accent);
	}
</style>
