<script lang="ts">
	import { ChevronRight, Pin, PinOff, X } from '@lucide/svelte';
	import type { PluginUpdateItem } from './update-checker';

	type PluginUpdateGroup = {
		pluginId: string;
		pluginName: string;
		updates: PluginUpdateItem[];
	};

	let { updates, pinnedUpdates, onClose, onKeepCurrent, onUnpin, onSelectUpdate } = $props<{
		updates: PluginUpdateItem[];
		pinnedUpdates: PluginUpdateItem[];
		onClose: () => void;
		onKeepCurrent: (update: PluginUpdateItem) => void;
		onUnpin: (update: PluginUpdateItem) => void;
		onSelectUpdate: (update: PluginUpdateItem) => void;
	}>();

	function groupUpdates(updates: PluginUpdateItem[]): PluginUpdateGroup[] {
		const groups: PluginUpdateGroup[] = [];
		for (const update of updates) {
			const group = groups.find((candidate) => candidate.pluginId === update.pluginId);
			if (group) group.updates.push(update);
			else
				groups.push({
					pluginId: update.pluginId,
					pluginName: update.pluginName,
					updates: [update]
				});
		}
		return groups;
	}

	let availableGroups = $derived(groupUpdates(updates));
	let pinnedGroups = $derived(groupUpdates(pinnedUpdates));
</script>

<div class="updates-dialog-backdrop">
	<button
		type="button"
		class="updates-dialog-dismiss"
		aria-label="Close updates dialog"
		onclick={onClose}
	></button>
	<dialog open class="updates-dialog" aria-labelledby="updates-dialog-title">
		<div class="updates-dialog-header">
			<div>
				<h2 id="updates-dialog-title">Plugin Updates</h2>
			</div>
			<button
				type="button"
				class="dialog-close-button"
				aria-label="Close updates dialog"
				onclick={onClose}
			>
				<X size={18} strokeWidth={1.8} aria-hidden="true" />
			</button>
		</div>
		<div class="update-columns">
			<section class="update-section" aria-labelledby="available-updates-title">
				<div class="update-section-heading">
					<h3 id="available-updates-title">Available</h3>
					<span>{updates.length}</span>
				</div>
				<div class="update-list">
					{#if availableGroups.length}
						{#each availableGroups as group (group.pluginId)}
							<section class="update-group" aria-label={`${group.pluginName} updates`}>
								<div class="update-group-heading">
									<strong>{group.pluginName}</strong><span>{group.updates.length}</span>
								</div>
								{#each group.updates as update (update.id)}
									<section
										class="update-item"
										aria-label={`${update.pluginName} update for ${update.installLabel}`}
									>
										<button
											type="button"
											class="update-item-main"
											onclick={() => onSelectUpdate(update)}
										>
											<span class="update-item-copy">
												<small>{update.installLabel} / build {update.installBuild}</small>
												<span class="update-version">
													{update.currentVersion}<span aria-hidden="true">&rarr;</span
													>{update.latestVersion}
												</span>
											</span>
											<ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" />
										</button>
										<button
											type="button"
											class="keep-version-button"
											aria-label={`Keep ${update.currentVersion} for ${update.pluginName} on ${update.installLabel}`}
											title="Pin current version"
											onclick={() => onKeepCurrent(update)}
										>
											<Pin size={15} strokeWidth={1.8} aria-hidden="true" />
										</button>
									</section>
								{/each}
							</section>
						{/each}
					{:else}
						<p class="empty-update-list">No unpinned updates.</p>
					{/if}
				</div>
			</section>
			<aside class="pinned-section" aria-labelledby="pinned-updates-title">
				<div class="update-section-heading">
					<h3 id="pinned-updates-title">Pinned versions</h3>
					<span>{pinnedUpdates.length}</span>
				</div>
				<div class="pinned-list">
					{#if pinnedGroups.length}
						{#each pinnedGroups as group (group.pluginId)}
							<section class="pinned-group" aria-label={`${group.pluginName} pinned versions`}>
								<div class="update-group-heading">
									<strong>{group.pluginName}</strong><span>{group.updates.length}</span>
								</div>
								{#each group.updates as update (update.id)}
									<section class="pinned-item">
										<button
											type="button"
											class="pinned-item-main"
											aria-label={`Open ${update.pluginName} on ${update.installLabel}`}
											onclick={() => onSelectUpdate(update)}
										>
											<span class="update-item-copy">
												<small>{update.installLabel} / build {update.installBuild}</small>
												<span class="pinned-version">{update.currentVersion}</span>
											</span>
											<ChevronRight size={15} strokeWidth={1.8} aria-hidden="true" />
										</button>
										<button
											type="button"
											class="unpin-button"
											aria-label={`Allow updates for ${update.pluginName} on ${update.installLabel}`}
											title="Allow updates"
											onclick={() => onUnpin(update)}
										>
											<PinOff size={15} strokeWidth={1.8} aria-hidden="true" />
										</button>
									</section>
								{/each}
							</section>
						{/each}
					{:else}
						<p class="empty-update-list">No pinned versions.</p>
					{/if}
				</div>
			</aside>
		</div>
	</dialog>
</div>

<style>
	.updates-dialog-backdrop {
		position: fixed;
		inset: 0;
		z-index: 9000;
		display: grid;
		place-items: center;
		padding: 24px;
		background: rgba(9, 14, 15, 0.72);
	}

	.updates-dialog-dismiss {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
		background: transparent;
		cursor: default;
	}

	.updates-dialog {
		position: relative;
		z-index: 1;
		display: flex;
		width: min(920px, 100%);
		max-height: min(900px, calc(100dvh - 48px));
		flex-direction: column;
		overflow: hidden;
		padding: 22px;
		border: 1px solid var(--line-strong);
		border-radius: 8px;
		background: #182224;
		box-shadow: 0 22px 70px rgba(0, 0, 0, 0.42);
	}

	.updates-dialog-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 20px;
	}

	.updates-dialog-header h2 {
		margin: 0;
		font-size: 22px;
		font-weight: 600;
	}

	.dialog-close-button {
		display: inline-flex;
		width: 34px;
		height: 34px;
		align-items: center;
		justify-content: center;
		flex: 0 0 auto;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
	}

	.dialog-close-button:hover,
	.dialog-close-button:focus-visible {
		border-color: #df6d58;
		color: #ffb09f;
		outline: none;
	}

	.update-columns {
		display: grid;
		grid-template-columns: minmax(0, 1.6fr) minmax(220px, 0.8fr);
		gap: 18px;
		min-height: 0;
		margin-top: 14px;
	}

	.update-section,
	.pinned-section {
		display: flex;
		min-width: 0;
		flex-direction: column;
	}

	.pinned-section {
		padding-left: 18px;
		border-left: 1px solid var(--line);
	}

	.update-section-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		color: var(--text-muted);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 14px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.update-section-heading h3 {
		margin: 0;
		color: var(--text);
		font-size: 12px;
		font-weight: 600;
	}

	.update-list,
	.pinned-list {
		display: grid;
		gap: 5px;
		min-height: 0;
		margin-top: 7px;
		overflow: auto;
	}

	.pinned-list {
		align-content: start;
	}

	.update-group,
	.pinned-group {
		display: grid;
		gap: 3px;
	}

	.update-group-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 2px 2px 0;
		color: var(--text-muted);
		font-size: 14px;
	}

	.update-group-heading strong {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.update-group-heading span {
		flex: 0 0 auto;
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 14px;
	}

	.update-item {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: stretch;
		border: 1px solid rgba(211, 155, 56, 0.2);
		border-radius: 5px;
		background: rgba(211, 155, 56, 0.08);
	}

	.update-item-main {
		display: flex;
		min-width: 0;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 7px 9px;
		border: 0;
		background: transparent;
		color: var(--text);
		cursor: pointer;
		text-align: left;
	}

	.update-item-main:hover,
	.update-item-main:focus-visible {
		background: rgba(211, 155, 56, 0.1);
		outline: none;
	}

	.update-item-copy {
		display: grid;
		min-width: 0;
		gap: 1px;
	}

	.update-item-copy small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.update-item-copy small {
		color: var(--text-muted);
		font-size: 11px;
		line-height: 1.2;
	}

	.update-version {
		display: inline-flex;
		gap: 7px;
		color: #f0c96f;
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 12px;
		line-height: 1.2;
	}

	.keep-version-button {
		display: grid;
		width: 30px;
		place-items: center;
		padding: 0;
		border: 1px solid rgba(57, 155, 130, 0.35);
		border-radius: 4px;
		background: transparent;
		color: #8bd2bb;
		font: inherit;
		font-size: 11px;
		cursor: pointer;
	}

	.keep-version-button:hover,
	.keep-version-button:focus-visible {
		border-color: #8bd2bb;
		background: rgba(57, 155, 130, 0.14);
		outline: none;
	}

	.pinned-item {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 8px;
		padding: 7px 8px;
		border: 1px solid rgba(57, 155, 130, 0.28);
		border-radius: 5px;
		background: rgba(57, 155, 130, 0.08);
	}

	.pinned-item:hover,
	.pinned-item:focus-within {
		border-color: #8bd2bb;
		background: rgba(57, 155, 130, 0.14);
	}

	.pinned-item-main {
		display: flex;
		min-width: 0;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		cursor: pointer;
		text-align: left;
	}

	.pinned-item-main:hover,
	.pinned-item-main:focus-visible {
		color: var(--text);
		outline: none;
	}

	.pinned-version {
		color: #8bd2bb;
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 12px;
	}

	.unpin-button {
		display: grid;
		width: 30px;
		height: 30px;
		place-items: center;
		padding: 0;
		border: 1px solid rgba(57, 155, 130, 0.35);
		border-radius: 4px;
		background: transparent;
		color: #8bd2bb;
		font: inherit;
		font-size: 11px;
		cursor: pointer;
	}

	.unpin-button:hover,
	.unpin-button:focus-visible {
		border-color: #8bd2bb;
		background: rgba(57, 155, 130, 0.14);
		outline: none;
	}

	.empty-update-list {
		margin: 0;
		padding: 12px;
		border: 1px dashed var(--line);
		border-radius: 5px;
		color: var(--text-muted);
		font-size: 12px;
	}

	@media (max-width: 560px) {
		.updates-dialog-backdrop {
			padding: 12px;
		}

		.updates-dialog {
			padding: 16px;
		}

		.update-columns {
			grid-template-columns: 1fr;
		}

		.pinned-section {
			padding-top: 16px;
			padding-left: 0;
			border-top: 1px solid var(--line);
			border-left: 0;
		}

		.update-item {
			grid-template-columns: 1fr;
		}

		.keep-version-button {
			min-height: 34px;
			border-top: 1px solid rgba(211, 155, 56, 0.2);
			border-left: 0;
		}
	}
</style>
