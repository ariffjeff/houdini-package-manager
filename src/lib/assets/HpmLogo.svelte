<script lang="ts">
	let {
		color = 'currentColor',
		class: className = '',
		...rest
	} = $props<{ color?: string; class?: string; [key: string]: unknown }>();
</script>

<svg
	{...rest}
	class={className}
	viewBox="0 0 48 24"
	fill={color}
	role="img"
	xmlns="http://www.w3.org/2000/svg"
>
	<path d="M0 4h4.27v5.99h5.49V4h4.27v16H9.76v-6.08H4.27V20H0V4Z" />
	<path
		d="M16.77 4h6.61c3.9 0 6.41 2.08 6.41 5.62v.05c0 3.77-2.8 5.76-6.63 5.76h-2.11V20h-4.27V4Zm6.3 7.95c1.52 0 2.44-.82 2.44-2.08v-.05c0-1.37-.93-2.1-2.47-2.1h-2.01v4.23h2.03Z"
	/>
	<path
		d="M31.61 4h4.52l3.68 6.19L43.49 4h4.52v16h-4.25v-9.19l-3.94 6.26h-.09l-3.92-6.22V20h-4.2V4Z"
	/>
</svg>
