<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import type { ActivationNode } from './types';

	let { data, selected }: NodeProps<ActivationNode> = $props();
</script>

<div
	class={['activation-node', `kind-${data.kind}`, selected && 'is-selected']}
	style:--node-accent={data.accent}
	role="group"
	aria-label={`${data.label}, ${data.statusLabel}`}
>
	<div class="node-accent"></div>
	<div class="node-content">
		<div class="node-header">
			<span class="node-eyebrow">{data.eyebrow}</span>
			<span class={['node-state', `status-${data.status}`]}>{data.statusLabel}</span>
		</div>
		<strong>{data.label}</strong>
		<span class="node-meta">{data.meta}</span>
	</div>

	{#if data.kind === 'plugin'}
		<Handle type="source" position={Position.Right} />
	{:else}
		<Handle type="target" position={Position.Left} />
	{/if}
</div>

<style>
	.activation-node {
		position: relative;
		display: flex;
		width: 100%;
		height: 100%;
		overflow: hidden;
		border: 1px solid var(--line-strong);
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
		border-color: var(--node-accent);
		box-shadow:
			0 10px 28px rgba(0, 0, 0, 0.32),
			0 0 0 3px color-mix(in srgb, var(--node-accent) 22%, transparent);
		transform: translateY(-2px);
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
		gap: 6px;
		padding: 17px 18px;
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
		font-size: 10px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.node-eyebrow {
		color: #8ca099;
	}

	.node-state {
		color: #399b82;
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

	:global(.svelte-flow__handle) {
		width: 9px;
		height: 9px;
		border: 2px solid #202b2d;
		background: var(--node-accent);
	}
</style>
