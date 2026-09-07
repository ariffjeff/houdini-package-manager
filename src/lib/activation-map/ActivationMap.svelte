<script lang="ts">
	import {
		Background,
		Controls,
		// MiniMap,
		SvelteFlow,
		type NodeEventWithPointer,
		type NodeTypes
	} from '@xyflow/svelte';
	import ActivationNode from './ActivationNode.svelte';
	import type { ActivationEdge, ActivationNode as ActivationNodeRecord } from './types';

	type Props = {
		nodes: ActivationNodeRecord[];
		edges: ActivationEdge[];
		onselect: (id: string | null) => void;
	};

	let { nodes, edges, onselect }: Props = $props();

	const nodeTypes = {
		plugin: ActivationNode,
		install: ActivationNode
	} satisfies NodeTypes;

	const handleNodeClick: NodeEventWithPointer<MouseEvent | TouchEvent, ActivationNodeRecord> = ({
		node
	}) => {
		onselect(node.id);
	};

	const handleSelectionChange = ({ nodes: selectedNodes }: { nodes: ActivationNodeRecord[] }) => {
		onselect(selectedNodes[0]?.id ?? null);
	};

	const handlePaneClick = () => onselect(null);
</script>

<div class="flow-shell" role="group" aria-label="Plugin activation map">
	<SvelteFlow
		bind:nodes
		bind:edges
		{nodeTypes}
		fitView
		fitViewOptions={{ padding: 0.16 }}
		nodesDraggable={false}
		nodesConnectable={false}
		elementsSelectable
		deleteKey={null}
		onnodeclick={handleNodeClick}
		onselectionchange={handleSelectionChange}
		onpaneclick={handlePaneClick}
		attributionPosition="bottom-left"
		style="color: white;"
	>
		<Controls showZoom={false} />
		<!-- <MiniMap /> -->
	</SvelteFlow>
</div>

<style>
	.flow-shell {
		position: relative;
		min-height: 620px;
		height: 100%;
		width: 100%;
		overflow: hidden;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: #151d20;
	}

	:global(.svelte-flow) {
		font-family: 'Avenir Next', 'Trebuchet MS', sans-serif;
	}

	:global(.svelte-flow__controls) {
		overflow: hidden;
		border: 1px solid var(--line-strong);
		border-radius: 7px;
		box-shadow: 0 6px 18px rgba(0, 0, 0, 0.24);
	}

	:global(.svelte-flow__controls-button) {
		border-bottom-color: var(--line);
		background: #202d30;
		fill: #d5e4df;
	}

	:global(.svelte-flow__minimap) {
		border: 1px solid var(--line-strong);
		border-radius: 7px;
		background: rgba(24, 34, 36, 0.92);
		box-shadow: 0 6px 18px rgba(0, 0, 0, 0.24);
	}
</style>
