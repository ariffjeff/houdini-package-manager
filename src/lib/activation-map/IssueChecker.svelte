<script lang="ts">
	import { ChevronRight, X } from '@lucide/svelte';
	import {
		filterIssueItems,
		groupIssueTargets,
		issueGroupInstallLabels,
		issueGroupMessages,
		type IssueConfigOption,
		type IssueItem
	} from './issue-checker';
	import type { ActivationTarget, HoudiniInstall } from './types';

	let {
		issueItems,
		issueConfigOptions,
		installs,
		filterId,
		groupIssueBuilds,
		onClose,
		onFilterChange,
		onGroupBuildsChange,
		onSelectIssue
	} = $props<{
		issueItems: IssueItem[];
		issueConfigOptions: IssueConfigOption[];
		installs: HoudiniInstall[];
		filterId: string;
		groupIssueBuilds: boolean;
		onClose: () => void;
		onFilterChange: (filterId: string) => void;
		onGroupBuildsChange: (groupIssueBuilds: boolean) => void;
		onSelectIssue: (issue: IssueItem, target: ActivationTarget) => void;
	}>();

	let issueCheckerFilter = $derived(
		issueConfigOptions.find((option: IssueConfigOption) => option.id === filterId)?.filter ?? null
	);
	let visibleIssueItems = $derived(filterIssueItems(issueItems, issueCheckerFilter, installs));
	let visibleIssueCount = $derived(
		visibleIssueItems.reduce((count, issue) => count + issue.targets.length, 0)
	);
	let visibleIssueGroups = $derived(groupIssueTargets(visibleIssueItems, groupIssueBuilds));
</script>

<div class="issues-dialog-backdrop">
	<button
		type="button"
		class="issues-dialog-dismiss"
		aria-label="Close issues dialog"
		onclick={onClose}
	></button>
	<dialog open class="issues-dialog" aria-labelledby="issues-dialog-title">
		<div class="issues-dialog-header issue-checker-header">
			<div class="issue-checker-heading">
				<h2 id="issues-dialog-title">Issue checker</h2>
				<p>
					{visibleIssueCount} config issues
					{issueCheckerFilter ? `for ${issueCheckerFilter.packageFile}` : 'across the workspace'}
				</p>
			</div>
			<div class="issue-checker-controls">
				<label class="issue-config-filter">
					<span>Config</span>
					<select
						aria-label="Filter issues by config"
						value={filterId}
						onchange={(event) => onFilterChange((event.currentTarget as HTMLSelectElement).value)}
					>
						<option value="all">All configs</option>
						{#each issueConfigOptions as option (option.id)}
							<option value={option.id}>{option.label}</option>
						{/each}
					</select>
				</label>
				<label class="issue-build-toggle">
					<input
						type="checkbox"
						checked={groupIssueBuilds}
						onchange={(event) =>
							onGroupBuildsChange((event.currentTarget as HTMLInputElement).checked)}
					/>
					<span>Group builds</span>
				</label>
				<button
					type="button"
					class="dialog-close-button"
					aria-label="Close issue checker"
					onclick={onClose}
				>
					<X size={18} strokeWidth={1.8} aria-hidden="true" />
				</button>
			</div>
		</div>
		<div class="issue-list">
			{#each visibleIssueItems as issue (issue.pluginId)}
				<section class="issue-plugin-group" aria-label={`${issue.label} issues`}>
					<div class="issue-plugin-heading">
						<span class={['issue-status-marker', `status-${issue.statuses[0]}`]} aria-hidden="true"
						></span>
						<div class="issue-list-copy">
							<strong>{issue.label}</strong>
							<small
								>{issue.targets.length} config issue{issue.targets.length === 1 ? '' : 's'}</small
							>
						</div>
					</div>
					<div class="issue-config-list">
						{#each visibleIssueGroups.get(issue.pluginId) ?? [] as group (group.id)}
							{@const target = group.targets[0]}
							<button
								type="button"
								class="issue-config-item"
								aria-label={`Open ${issue.label} issue details for ${issueGroupInstallLabels(group.targets, installs).join(', ')}`}
								onclick={() => onSelectIssue(issue, target)}
							>
								<span class={['issue-status-marker', `status-${target.status}`]} aria-hidden="true"
								></span>
								<span class="issue-list-copy">
									<strong>{target.packageFile}</strong>
									{#each issueGroupInstallLabels(group.targets, installs) as buildLabel (buildLabel)}
										<small>{buildLabel}</small>
									{/each}
									{#each issueGroupMessages(group.targets) as message (message)}
										<small class="issue-list-note">{message}</small>
									{/each}
								</span>
								<ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" />
							</button>
						{/each}
					</div>
				</section>
			{/each}
		</div>
	</dialog>
</div>

<style>
	.issues-dialog-backdrop {
		position: fixed;
		inset: 0;
		z-index: 9000;
		display: grid;
		place-items: center;
		padding: 24px;
		background: rgba(9, 14, 15, 0.72);
	}

	.issues-dialog-dismiss {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
		background: transparent;
		cursor: default;
	}

	.issues-dialog {
		position: relative;
		z-index: 1;
		display: flex;
		width: min(640px, 100%);
		max-height: min(900px, calc(100dvh - 48px));
		flex-direction: column;
		overflow: hidden;
		padding: 22px;
		border: 1px solid var(--line-strong);
		border-radius: 8px;
		background: #182224;
		box-shadow: 0 22px 70px rgba(0, 0, 0, 0.42);
	}

	.issues-dialog-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 20px;
	}

	.issues-dialog-header h2 {
		margin: 0;
		font-size: 22px;
		font-weight: 600;
	}

	.issues-dialog-header p:last-child {
		margin: 7px 0 0;
		color: var(--text-muted);
		font-size: 12px;
	}

	.issue-checker-header {
		align-items: flex-end;
		gap: 24px;
	}

	.issue-checker-heading {
		min-width: 0;
	}

	.issue-checker-heading h2 {
		line-height: 1.1;
	}

	.issue-checker-controls {
		display: flex;
		align-items: flex-end;
		justify-content: flex-end;
		gap: 12px;
		min-width: 0;
	}

	.issue-config-filter {
		display: grid;
		min-width: 190px;
		gap: 5px;
		color: var(--text-muted);
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.issue-config-filter select {
		min-width: 190px;
		padding: 7px 28px 7px 9px;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: #101819;
		color: var(--text);
		font: inherit;
		font-size: 12px;
		font-weight: 500;
		letter-spacing: 0;
		text-transform: none;
	}

	.issue-config-filter select:focus-visible {
		border-color: #df6d58;
		outline: 2px solid rgba(223, 109, 88, 0.28);
		outline-offset: 1px;
	}

	.issue-build-toggle {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		min-height: 34px;
		padding: 0 2px;
		color: var(--text-muted);
		font-size: 12px;
		font-weight: 600;
		white-space: nowrap;
	}

	.issue-build-toggle input {
		width: 15px;
		height: 15px;
		margin: 0;
		accent-color: #df6d58;
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

	.issue-list {
		display: flex;
		min-height: 0;
		flex-direction: column;
		gap: 8px;
		overflow-y: auto;
		padding-top: 16px;
	}

	.issue-plugin-group {
		display: grid;
		gap: 7px;
		padding: 10px;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.025);
	}

	.issue-plugin-heading {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 2px 2px 3px;
	}

	.issue-config-list {
		display: grid;
		gap: 5px;
		padding-left: 19px;
	}

	.issue-config-item {
		display: grid;
		grid-template-columns: 8px minmax(0, 1fr) auto;
		align-items: start;
		gap: 10px;
		width: 100%;
		padding: 8px 9px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.12);
		color: var(--text);
		cursor: pointer;
		font: inherit;
		text-align: left;
	}

	.issue-config-item:hover,
	.issue-config-item:focus-visible {
		border-color: rgba(223, 109, 88, 0.7);
		background: rgba(223, 109, 88, 0.09);
		outline: none;
	}

	.issue-status-marker {
		width: 9px;
		height: 9px;
		margin-top: 4px;
		border-radius: 50%;
		background: #d39b38;
	}

	.issue-status-marker.status-incompatible,
	.issue-status-marker.status-missing {
		background: #df6d58;
	}

	.issue-list-copy {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 4px;
	}

	.issue-list-copy strong {
		font-size: 13px;
		font-weight: 600;
	}

	.issue-list-copy small {
		color: var(--text-muted);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 12px;
		line-height: 1.4;
		overflow-wrap: anywhere;
	}

	.issue-config-item > :last-child {
		margin-top: 2px;
		color: var(--text-dim);
	}

	@media (max-width: 760px) {
		.issue-checker-header {
			align-items: stretch;
			flex-direction: column;
			gap: 16px;
		}

		.issue-checker-controls {
			align-items: stretch;
			justify-content: stretch;
			flex-wrap: wrap;
			gap: 10px;
		}

		.issue-config-filter {
			flex: 1 1 100%;
			min-width: 0;
		}

		.issue-config-filter select {
			width: 100%;
			min-width: 0;
		}

		.issue-build-toggle {
			min-height: 34px;
		}
	}
</style>
