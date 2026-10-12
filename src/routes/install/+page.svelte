<script lang="ts">
	import AppHeader from '$lib/AppHeader.svelte';
	import PluginDiscoveryPage from '$lib/plugin-discovery/PluginDiscoveryPage.svelte';
	import Tooltip from '$lib/Tooltip.svelte';
</script>

<svelte:head>
	<title>HPM / Install Plugin</title>
	<meta
		name="description"
		content="Install a Houdini plugin and review its package manifest before installation."
	/>
</svelte:head>

<div class="page-shell px-3.5 pb-4 sm:px-6 lg:px-10">
	<Tooltip />
	<AppHeader activeSection="install" />

	<main class="page-main">
		<PluginDiscoveryPage mode="install" />
	</main>
</div>

<style>
	.page-shell {
		box-sizing: border-box;
		display: flex;
		height: 100dvh;
		min-height: 0;
		flex-direction: column;
		overflow-x: hidden;
	}

	.page-main {
		display: flex;
		min-height: 0;
		flex: 1 1 auto;
		flex-direction: column;
		width: 100%;
	}
</style>
