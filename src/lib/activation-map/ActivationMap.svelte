<script lang="ts">
	import {
		ControlButton,
		Controls,
		// MiniMap,
		SvelteFlow,
		type NodeEventWithPointer,
		type NodeTypes
	} from '@xyflow/svelte';
	import { Spline } from '@lucide/svelte';
	import ActivationNode from './ActivationNode.svelte';
	import ActivationMapViewport from './ActivationMapViewport.svelte';
	import type { ActivationEdge, ActivationNode as ActivationNodeRecord } from './types';

	type Props = {
		nodes: ActivationNodeRecord[];
		edges: ActivationEdge[];
		onselect: (id: string | null) => void;
		focusNodeId?: string | null;
		onfocuscomplete?: () => void;
	};

	let { nodes, edges, onselect, focusNodeId = null, onfocuscomplete = () => {} }: Props = $props();

	const nodeTypes = {
		plugin: ActivationNode,
		official: ActivationNode,
		install: ActivationNode
	} satisfies NodeTypes;

	const edgeTypes = ['smoothstep', 'bezier', 'straight'] as const;
	const edgeTypeLabels = {
		smoothstep: 'Smooth step',
		bezier: 'Bezier',
		straight: 'Straight'
	} satisfies Record<(typeof edgeTypes)[number], string>;
	let edgeTypeIndex = $state(0);
	let currentEdgeType = $derived(edgeTypes[edgeTypeIndex]);
	let renderedEdges = $derived(
		edges.map((edge) => ({
			...edge,
			type: currentEdgeType
		}))
	);

	const handleNodeClick: NodeEventWithPointer<MouseEvent | TouchEvent, ActivationNodeRecord> = ({
		node
	}) => {
		onselect(node.id);
	};

	const handleSelectionChange = ({ nodes: selectedNodes }: { nodes: ActivationNodeRecord[] }) => {
		onselect(selectedNodes[0]?.id ?? null);
	};

	const handlePaneClick = () => onselect(null);

	function cycleEdgeType() {
		edgeTypeIndex = (edgeTypeIndex + 1) % edgeTypes.length;
	}
</script>

<div class="flow-shell" role="group" aria-label="Plugin activation map">
	<SvelteFlow
		bind:nodes
		edges={renderedEdges}
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
		<Controls showZoom={false}>
			{#snippet before()}
				<ControlButton
					type="button"
					title={`Wire style: ${edgeTypeLabels[currentEdgeType]}`}
					aria-label={`Change wire style, currently ${edgeTypeLabels[currentEdgeType]}`}
					onclick={cycleEdgeType}
				>
					<Spline size={16} strokeWidth={1.9} aria-hidden="true" />
				</ControlButton>
			{/snippet}
		</Controls>
		<ActivationMapViewport nodeId={focusNodeId} {nodes} {onfocuscomplete} />
		<!-- <MiniMap /> -->
	</SvelteFlow>
</div>

<style>
	.flow-shell {
		position: relative;
		min-height: 0;
		flex: 1;
		height: auto;
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
