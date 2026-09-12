<script lang="ts">
	import { useSvelteFlow } from '@xyflow/svelte';

	type Props = {
		nodeId: string | null;
		nodes: unknown[];
		onfocuscomplete: () => void;
	};

	let { nodeId, nodes, onfocuscomplete }: Props = $props();
	const { getNode, setCenter } = useSvelteFlow();
	let focusedNodeId: string | null = null;

	$effect(() => {
		void nodes;
		if (!nodeId || nodeId === focusedNodeId) return;

		const node = getNode(nodeId);
		if (!node) return;

		focusedNodeId = nodeId;
		const width = node.measured?.width ?? node.width ?? 0;
		const height = node.measured?.height ?? node.height ?? 0;
		void setCenter(node.position.x + width / 2, node.position.y + height / 2, {
			zoom: 1.35,
			duration: 350
		}).then(onfocuscomplete);
	});
</script>
