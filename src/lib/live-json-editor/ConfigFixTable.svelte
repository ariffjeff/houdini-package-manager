<script lang="ts">
	import { TriangleAlert } from '@lucide/svelte';
	import type { PackageConfigIssue } from '$lib/houdini/types';
	import { pathAliasConflictDescription, type ConfigFixState } from './config-editor';

	type Props = {
		state: ConfigFixState;
		disabled?: boolean;
		idPrefix?: string;
		manifestIssues?: PackageConfigIssue[];
		manifestUninspected?: boolean;
		manifestDraftError?: string;
		highlightedControllerId?: string | null;
	};

	let {
		state = $bindable(),
		disabled = false,
		idPrefix = 'config',
		manifestIssues = [],
		manifestUninspected = false,
		manifestDraftError = '',
		highlightedControllerId = null
	}: Props = $props();

	function issueFix(issue: PackageConfigIssue): string {
		switch (issue.code) {
			case 'path-alias-location':
				return 'Normalize the path alias locations.';
			case 'path-alias-conflict':
				return 'Choose which duplicate path alias to keep.';
			case 'deprecated-path':
				return 'Migrate the deprecated path key to hpath.';
			case 'invalid-json':
			case 'non-object':
				return 'Edit the manifest JSON above.';
			default:
				return 'Review and edit the manifest JSON above.';
		}
	}
</script>

<div class="config-fix-table-shell">
	<table class="config-fix-table" aria-label="Manifest issues and fixes">
		<thead>
			<tr>
				<th scope="col">Issue</th>
				<th scope="col">Fix</th>
			</tr>
		</thead>
		<tbody>
			{#each manifestIssues as issue (issue.code)}
				<tr
					class:config-fix-controller-highlighted={issue.code === 'deprecated-path' &&
						highlightedControllerId === 'deprecated-path'}
				>
					<td class:has-fatal={issue.severity === 'fatal'}>
						<div class="config-table-issue">
							<TriangleAlert size={16} strokeWidth={1.9} aria-hidden="true" />
							<span>{issue.message}</span>
						</div>
					</td>
					<td>
						{#if issue.code === 'path-alias-location' && state.pathAliasLocationIssue}
							<label class="config-fix-toggle">
								<input type="checkbox" bind:checked={state.applyPathAliasLocationFix} {disabled} />
								<span>Normalize path alias locations</span>
							</label>
						{:else if issue.code === 'path-alias-conflict' && state.pathAliasConflict}
							<div class="config-table-fix">
								<label class="config-fix-toggle">
									<input type="checkbox" bind:checked={state.applyPathAliasFix} {disabled} />
									<span>Resolve duplicate path aliases</span>
								</label>
								<p>{pathAliasConflictDescription(state.pathAliasConflict)}</p>
								{#if state.applyPathAliasFix}
									<div
										class="config-alias-options"
										role="radiogroup"
										aria-label="Path alias resolution"
									>
										{#if !state.pathAliasConflict.houdiniPathUsedAsVariable}
											<label>
												<input
													type="radio"
													name={`${idPrefix}-path-alias`}
													value="keep-hpath"
													bind:group={state.pathAliasResolution}
													{disabled}
												/>
												<span>Keep <code>hpath</code></span>
											</label>
										{/if}
										{#if !state.pathAliasConflict.hpathUsedAsVariable}
											<label>
												<input
													type="radio"
													name={`${idPrefix}-path-alias`}
													value="keep-HOUDINI_PATH"
													bind:group={state.pathAliasResolution}
													{disabled}
												/>
												<span>Keep <code>HOUDINI_PATH</code></span>
											</label>
										{/if}
										{#if state.pathAliasConflict.hpathUsedAsVariable}
											<label>
												<input
													type="radio"
													name={`${idPrefix}-path-alias`}
													value="replace-HOUDINI_PATH"
													bind:group={state.pathAliasResolution}
													{disabled}
												/>
												<span>Replace <code>$hpath</code> references</span>
											</label>
										{/if}
										{#if state.pathAliasConflict.houdiniPathUsedAsVariable}
											<label>
												<input
													type="radio"
													name={`${idPrefix}-path-alias`}
													value="replace-hpath"
													bind:group={state.pathAliasResolution}
													{disabled}
												/>
												<span>Replace <code>$HOUDINI_PATH</code> references</span>
											</label>
										{/if}
									</div>
								{/if}
							</div>
						{:else if issue.code === 'deprecated-path' && state.config.path !== undefined}
							<div class="config-table-fix">
								<label class="config-fix-toggle">
									<input type="checkbox" bind:checked={state.migrateLegacyPath} {disabled} />
									<span>Replace deprecated <code>path</code></span>
								</label>
								<label class="config-fix-alias-choice">
									<span>Replace with</span>
									<select
										aria-label="Replacement alias for deprecated path"
										bind:value={state.legacyPathAlias}
										{disabled}
									>
										<option value="hpath">hpath</option>
										<option value="HOUDINI_PATH">HOUDINI_PATH</option>
									</select>
								</label>
							</div>
						{:else}
							<span class="config-table-fix-note">{issueFix(issue)}</span>
						{/if}
					</td>
				</tr>
			{/each}

			{#if manifestUninspected}
				<tr>
					<td
						><span class="config-table-issue">Manifest was not inspected during discovery.</span
						></td
					>
					<td
						><span class="config-table-fix-note"
							>Edit the manifest JSON above before installing.</span
						></td
					>
				</tr>
			{/if}
			{#if manifestDraftError}
				<tr>
					<td class="has-fatal"><span class="config-table-issue">{manifestDraftError}</span></td>
					<td><span class="config-table-fix-note">Correct the JSON in the editor above.</span></td>
				</tr>
			{/if}
			{#each state.undefinedVariableReferences as reference (reference)}
				<tr>
					<td
						><span class="config-table-issue">Undefined variable <code>${reference}</code></span
						></td
					>
					<td
						><span class="config-table-fix-note"
							>Replace or define this variable in the JSON above.</span
						></td
					>
				</tr>
			{/each}
			{#if state.pathAliasLocationIssue && !manifestIssues.some((issue) => issue.code === 'path-alias-location')}
				<tr>
					<td><span class="config-table-issue">Path aliases are in invalid locations.</span></td>
					<td>
						<label class="config-fix-toggle">
							<input type="checkbox" bind:checked={state.applyPathAliasLocationFix} {disabled} />
							<span>Normalize path alias locations</span>
						</label>
					</td>
				</tr>
			{/if}
			{#if state.sourcePathFixCandidates.length}
				<tr class:config-fix-controller-highlighted={highlightedControllerId === 'source-path-fix'}>
					<td><span class="config-table-issue">The managed plugin source is missing.</span></td>
					<td>
						<label class="config-fix-toggle">
							<input type="checkbox" bind:checked={state.applySourcePathFix} {disabled} />
							<span>Restore the source path</span>
						</label>
						{#if state.sourcePathFixCandidates.length > 1}
							<select
								class="config-table-select"
								aria-label="Existing plugin source"
								bind:value={state.sourcePathFixPath}
								disabled={!state.applySourcePathFix || disabled}
							>
								{#each state.sourcePathFixCandidates as candidate (candidate)}
									<option value={candidate}>{candidate}</option>
								{/each}
							</select>
						{:else}
							<code>{state.sourcePathFixPath}</code>
						{/if}
					</td>
				</tr>
			{/if}
			{#if state.config.path !== undefined && !manifestIssues.some((issue) => issue.code === 'deprecated-path')}
				<tr class:config-fix-controller-highlighted={highlightedControllerId === 'deprecated-path'}>
					<td><span class="config-table-issue">The deprecated path key is present.</span></td>
					<td>
						<label class="config-fix-toggle">
							<input type="checkbox" bind:checked={state.migrateLegacyPath} {disabled} />
							<span>Remove deprecated <code>path</code></span>
						</label>
					</td>
				</tr>
			{/if}
			{#if !manifestIssues.length && !manifestUninspected && !manifestDraftError && !state.undefinedVariableReferences.length && !state.pathAliasLocationIssue && !state.sourcePathFixCandidates.length && state.config.path === undefined && !state.pathAliasConflict}
				<tr>
					<td colspan="2"
						><span class="config-table-empty">No detected issues or automatic fixes.</span></td
					>
				</tr>
			{/if}
		</tbody>
	</table>
</div>

<style>
	.config-fix-table {
		min-width: 560px;
		width: 100%;
		border-collapse: separate;
		border-spacing: 0;
		color: var(--text-muted);
		font-size: 12px;
	}

	.config-fix-table-shell {
		overflow-x: auto;
		border: 1px solid var(--line);
		border-radius: 7px;
		background: rgba(0, 0, 0, 0.1);
		box-shadow: 0 8px 22px rgba(0, 0, 0, 0.12);
	}

	.config-fix-table th,
	.config-fix-table td {
		padding: 10px;
		text-align: left;
		vertical-align: top;
	}

	.config-fix-table th:first-child,
	.config-fix-table td:first-child {
		width: 42%;
	}

	.config-fix-table th {
		padding: 9px 11px;
		border-bottom: 1px solid var(--line-strong);
		background: rgba(255, 255, 255, 0.045);
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.config-fix-table td {
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}

	.config-fix-table tbody tr:last-child td {
		border-bottom: 0;
	}

	.config-fix-table tbody tr:nth-child(even) td {
		background: rgba(255, 255, 255, 0.018);
	}

	.config-fix-table tbody tr.config-fix-controller-highlighted td {
		background: rgba(211, 155, 56, 0.14);
		box-shadow:
			inset 0 1px 0 rgba(239, 190, 83, 0.45),
			inset 0 -1px 0 rgba(239, 190, 83, 0.45);
	}

	.config-fix-table td.has-fatal {
		background: rgba(223, 109, 88, 0.1);
		color: #ffb09f;
	}

	.config-table-issue {
		display: flex;
		min-width: 0;
		align-items: flex-start;
		gap: 7px;
		color: var(--text);
		font-weight: 520;
		line-height: 1.45;
		overflow-wrap: anywhere;
	}

	.config-table-issue :global(svg) {
		flex: 0 0 auto;
		margin-top: 1px;
		color: #d7a84c;
	}

	.config-fix-table td.has-fatal .config-table-issue :global(svg) {
		color: #ff9e8d;
	}

	.config-table-issue code,
	.config-table-fix code {
		color: #f0c875;
		font-family: 'Cascadia Code', 'Courier New', monospace;
	}

	.config-table-fix {
		display: grid;
		min-width: 0;
		gap: 7px;
	}

	.config-fix-alias-choice {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--text-muted);
		font-size: 12px;
	}

	.config-fix-alias-choice select {
		padding: 5px 7px;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: var(--surface-raised);
		color: var(--text);
		font: inherit;
	}

	.config-table-fix p,
	.config-table-fix-note,
	.config-table-empty {
		margin: 0;
		color: var(--text-muted);
		line-height: 1.45;
	}

	.config-table-select {
		box-sizing: border-box;
		min-width: 0;
		width: 100%;
		margin-top: 4px;
		padding: 7px 8px;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: var(--surface-raised);
		color: var(--text);
		font: inherit;
	}

	.config-table-select:focus-visible {
		border-color: #399b82;
		outline: 2px solid rgba(57, 155, 130, 0.28);
		outline-offset: 1px;
	}

	.config-fix-toggle {
		position: relative;
		display: flex;
		align-items: flex-start;
		gap: 8px;
		min-height: 32px;
		box-sizing: border-box;
		padding: 8px 9px 8px 39px;
		border: 1px solid rgba(211, 155, 56, 0.22);
		border-radius: 5px;
		background: rgba(211, 155, 56, 0.055);
		color: var(--text-dim);
		font-weight: 600;
		line-height: 1.4;
		cursor: pointer;
	}

	.config-fix-toggle:hover,
	.config-fix-toggle:has(input:focus-visible) {
		border-color: rgba(57, 155, 130, 0.58);
		background: rgba(57, 155, 130, 0.08);
		color: var(--text);
	}

	.config-fix-toggle input {
		position: absolute;
		inset: 8px auto 8px 0;
		z-index: 1;
		width: 30px;
		height: auto;
		margin: 0;
		cursor: pointer;
		opacity: 0;
	}

	.config-alias-options input {
		position: absolute;
		inset: 0 auto 0 0;
		z-index: 1;
		width: 30px;
		height: 100%;
		margin: 0;
		cursor: pointer;
		opacity: 0;
	}

	.config-fix-toggle::before {
		position: absolute;
		top: 8px;
		bottom: 8px;
		left: 9px;
		width: 22px;
		height: auto;
		box-sizing: border-box;
		border: 1px solid var(--line-strong);
		border-radius: 4px;
		background: rgba(8, 14, 16, 0.5);
		content: '';
		transition:
			background 140ms ease,
			border-color 140ms ease;
	}

	.config-fix-toggle::after {
		position: absolute;
		top: 50%;
		left: 20px;
		width: 6px;
		height: 11px;
		border: solid #f2fff9;
		border-width: 0 2px 2px 0;
		content: '';
		opacity: 0;
		transform: translate(-50%, -58%) rotate(45deg);
		transition: opacity 140ms ease;
	}

	.config-fix-toggle:has(input:checked)::before {
		border-color: #3d9b7c;
		background: #2e8065;
	}

	.config-fix-toggle:has(input:checked)::after {
		opacity: 1;
	}

	.config-fix-toggle:has(input:focus-visible) {
		outline: 3px solid rgba(59, 155, 130, 0.26);
		outline-offset: 1px;
	}

	.config-alias-options {
		display: grid;
		gap: 5px;
		padding-top: 2px;
	}

	.config-alias-options label {
		position: relative;
		display: flex;
		align-items: flex-start;
		gap: 7px;
		min-height: 32px;
		box-sizing: border-box;
		padding: 7px 7px 7px 37px;
		border: 1px solid transparent;
		border-radius: 4px;
		color: var(--text-muted);
		cursor: pointer;
	}

	.config-alias-options label:hover {
		border-color: var(--line);
		background: rgba(255, 255, 255, 0.035);
		color: var(--text);
	}

	.config-alias-options label::before {
		position: absolute;
		top: 50%;
		left: 9px;
		width: 18px;
		height: 18px;
		box-sizing: border-box;
		border: 1px solid var(--line-strong);
		border-radius: 50%;
		background: rgba(8, 14, 16, 0.5);
		content: '';
		transform: translateY(-50%);
		transition:
			background 140ms ease,
			border-color 140ms ease;
	}

	.config-alias-options label::after {
		position: absolute;
		top: 50%;
		left: 18px;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #f2fff9;
		content: '';
		opacity: 0;
		transform: translate(-50%, -50%);
		transition: opacity 140ms ease;
	}

	.config-alias-options label:has(input:checked)::before {
		border-color: #3d9b7c;
		background: #2e8065;
	}

	.config-alias-options label:has(input:checked)::after {
		opacity: 1;
	}

	.config-alias-options label:has(input:focus-visible) {
		outline: 3px solid rgba(59, 155, 130, 0.26);
		outline-offset: 1px;
	}

	.config-table-fix-note,
	.config-table-empty {
		display: block;
		padding: 2px 0;
	}

	.config-table-empty {
		color: var(--text-dim);
		font-style: italic;
	}

	@media (max-width: 560px) {
		.config-fix-table {
			min-width: 500px;
		}

		.config-fix-table th,
		.config-fix-table td {
			padding: 9px;
		}
	}
</style>
