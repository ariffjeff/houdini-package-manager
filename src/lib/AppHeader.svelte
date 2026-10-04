<script lang="ts">
	import { resolve } from '$app/paths';
	import { BookOpen } from '@lucide/svelte';
	import GithubLogo from '$lib/assets/GithubLogo.svelte';
	import HpmLogo from '$lib/assets/HpmLogo.svelte';

	type AppSection = 'library' | 'discover';

	let {
		activeSection,
		settingsDialogOpen = false,
		onOpenSettings = null
	} = $props<{
		activeSection: AppSection;
		settingsDialogOpen?: boolean;
		onOpenSettings?: (() => void) | null;
	}>();

	function handleSettingsClick(event: MouseEvent) {
		if (activeSection !== 'library') return;

		event.preventDefault();
		onOpenSettings?.();
	}
</script>

<header class="app-header mx-auto border-white/10 py-4.5 lg:py-5.5">
	<a class="app-logo flex items-center" href={resolve('/')} aria-label="HPM home">
		<HpmLogo class="h-7.5 w-auto" color="var(--accent-orange)" aria-hidden="true" />
	</a>
	<nav class="app-nav flex items-center gap-6.5 overflow-x-auto" aria-label="Primary navigation">
		<a class:active={activeSection === 'library'} href={resolve('/')}>Library</a>
		<a class:active={activeSection === 'discover'} href={resolve('/discover')}>Discover</a>
		<a
			href={resolve('/settings')}
			aria-haspopup={activeSection === 'library' ? 'dialog' : undefined}
			aria-expanded={activeSection === 'library' ? settingsDialogOpen : undefined}
			onclick={handleSettingsClick}>Settings</a
		>
	</nav>
	<ul class="header-resource-links flex flex-row gap-4" aria-label="Resources">
		<li>
			<a
				href="https://houpm.com"
				target="_blank"
				rel="noopener noreferrer"
				title="houpm.com"
				aria-label="houpm.com"
			>
				<HpmLogo class="resource-hpm-logo" color="var(--text-muted)" aria-hidden="true" />
			</a>
		</li>
		<li>
			<a
				href="https://github.com/ariffjeff/houdini-package-manager"
				target="_blank"
				rel="noopener noreferrer"
				title="HPM GitHub repo"
				aria-label="HPM GitHub repo"
			>
				<GithubLogo class="resource-github-logo" color="var(--text-muted)" aria-hidden="true" />
			</a>
		</li>
		<li>
			<a
				href="https://www.sidefx.com/docs/houdini/ref/plugins.html"
				target="_blank"
				rel="noopener noreferrer"
				title="Houdini package docs"
				aria-label="Houdini package docs"
			>
				<BookOpen size={18} strokeWidth={1.8} aria-hidden="true" />
			</a>
		</li>
	</ul>
</header>

<style>
	.app-header {
		display: grid;
		width: 100%;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		align-items: center;
		gap: 24px;
	}

	.app-logo {
		justify-self: start;
	}

	.app-nav {
		justify-self: center;
		justify-content: center;
	}

	.header-resource-links {
		justify-self: end;
		align-items: center;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.header-resource-links a {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 6px;
		border-radius: 4px;
		color: var(--text-muted);
	}

	.header-resource-links a:hover,
	.header-resource-links a:focus-visible {
		background: rgba(255, 255, 255, 0.06);
		color: var(--text);
		outline: none;
	}

	.header-resource-links :global(.resource-hpm-logo) {
		width: 30px;
		height: 30px;
	}

	.header-resource-links :global(.resource-github-logo) {
		width: 22px;
		height: 22px;
	}

	.header-resource-links :global(svg) {
		display: block;
	}

	@media (max-width: 760px) {
		.app-header {
			grid-template-columns: minmax(0, 1fr) auto;
			gap: 12px;
		}

		.app-nav {
			grid-column: 1 / -1;
			grid-row: 2;
			width: 100%;
			justify-content: center;
		}
	}

	:global {
		nav a {
			padding: 8px 0;
			color: var(--text-dim);
			font-size: 12px;
			text-decoration: none;
		}

		nav a:hover,
		nav a.active {
			color: var(--text);
		}

		nav a.active {
			border-bottom: 2px solid #e46e58;
		}

		@media (max-width: 760px) {
			nav a {
				white-space: nowrap;
			}
		}
	}
</style>
