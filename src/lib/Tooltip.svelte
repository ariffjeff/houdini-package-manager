<script lang="ts">
	type TooltipState = {
		text: string;
		left: number;
		top: number;
		placement: 'above' | 'below';
	};

	let tooltip = $state<TooltipState | null>(null);

	function tooltipTarget(target: EventTarget | null) {
		return target instanceof Element ? target.closest<HTMLElement>('[data-tooltip]') : null;
	}

	function showTooltip(target: EventTarget | null) {
		const element = tooltipTarget(target);
		if (!element) return;

		const text = element.dataset.tooltip;
		if (!text) return;

		const rect = element.getBoundingClientRect();
		const placement = rect.bottom + 44 <= window.innerHeight ? 'below' : 'above';
		tooltip = {
			text,
			left: rect.left + rect.width / 2,
			top: placement === 'below' ? rect.bottom + 8 : rect.top - 8,
			placement
		};
	}

	function hideTooltip(event: MouseEvent | FocusEvent) {
		if (tooltipTarget(event.relatedTarget)) return;
		tooltip = null;
	}
</script>

<svelte:document
	onmouseover={(event) => showTooltip(event.target)}
	onmouseout={hideTooltip}
	onfocusin={(event) => showTooltip(event.target)}
	onfocusout={hideTooltip}
/>

{#if tooltip}
	<div
		class={['global-tooltip', `global-tooltip-${tooltip.placement}`]}
		style:left={`${tooltip.left}px`}
		style:top={`${tooltip.top}px`}
		role="tooltip"
	>
		{tooltip.text}
	</div>
{/if}

<style>
	.global-tooltip {
		position: fixed;
		z-index: 10000;
		max-width: min(320px, calc(100vw - 24px));
		padding: 6px 8px;
		border: 1px solid rgba(211, 232, 225, 0.18);
		border-radius: 4px;
		background: #17221f;
		box-shadow: 0 8px 18px rgba(0, 0, 0, 0.22);
		color: var(--text);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 12px;
		line-height: 1.35;
		pointer-events: none;
		white-space: nowrap;
		transform: translateX(-50%);
	}

	.global-tooltip-above {
		transform: translate(-50%, -100%);
	}
</style>
