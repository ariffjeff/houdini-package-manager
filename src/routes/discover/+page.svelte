<script lang="ts">
	import AppHeader from '$lib/AppHeader.svelte';
	import PluginDiscoveryPage from '$lib/plugin-discovery/PluginDiscoveryPage.svelte';
	import Tooltip from '$lib/Tooltip.svelte';
</script>

<svelte:head>
	<title>HPM / Discover Plugins</title>
	<meta
		name="description"
		content="Discover and install open source Houdini plugins from curated and public GitHub sources."
	/>
</svelte:head>

<div class="page-shell px-3.5 pb-4 sm:px-6 lg:px-10">
	<Tooltip />
	<AppHeader activeSection="discover" />

	<main class="page-main">
		<PluginDiscoveryPage />
	</main>
</div>

<style>
	.page-shell {
		min-height: 100dvh;
		overflow-x: hidden;
	}

	.page-main {
		width: 100%;
	}
</style>
