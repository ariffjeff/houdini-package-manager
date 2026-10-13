<script lang="ts">
	import { TriangleAlert } from '@lucide/svelte';
	import type { PackageConfigIssue } from '$lib/houdini/types';
	import { pathAliasConflictDescription, type ConfigFixState } from './config-editor';
	import ConfigFixTable from './ConfigFixTable.svelte';

	type Props = {
		state: ConfigFixState;
		disabled?: boolean;
		idPrefix?: string;
		layout?: 'stacked' | 'table';
		manifestIssues?: PackageConfigIssue[];
		manifestFatal?: boolean;
		manifestUninspected?: boolean;
		manifestDraftError?: string;
		showHpmMetadataToggle?: boolean;
		includeHpmMetadata?: boolean;
		onHpmMetadataChange?: (value: boolean) => void;
	};

	let {
		state = $bindable(),
		disabled = false,
		idPrefix = 'config',
		layout = 'stacked',
		manifestIssues = [],
		manifestFatal = false,
		manifestUninspected = false,
		manifestDraftError = '',
		showHpmMetadataToggle = false,
		includeHpmMetadata = $bindable(true),
		onHpmMetadataChange
	}: Props = $props();

	function toggleFixCard(event: MouseEvent | KeyboardEvent, toggle: () => void): void {
		if (disabled) return;
		if (event.target instanceof HTMLElement && event.target.closest('input, label, select')) return;
		if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return;
		if (event instanceof KeyboardEvent) event.preventDefault();
		toggle();
	}
</script>

<div class:config-fix-table-mode={layout === 'table'} class="config-fix-mode">
	{#if showHpmMetadataToggle}
		<section
			class="config-final-preview-section"
			aria-labelledby={`${idPrefix}-final-config-title`}
		>
			<div class="config-final-preview-heading">
				<div>
					<strong id={`${idPrefix}-final-config-title`}>Apply HPM Metadata</strong>
					<p>Adds repository and version details so HPM can identify and track this plugin.</p>
				</div>
				<label class="config-final-preview-toggle">
					<input
						type="checkbox"
						checked={includeHpmMetadata}
						onchange={(event) => {
							includeHpmMetadata = (event.currentTarget as HTMLInputElement).checked;
							onHpmMetadataChange?.(includeHpmMetadata);
						}}
						{disabled}
					/>
					<span>Append HPM metadata</span>
				</label>
			</div>
		</section>
	{/if}
	<ConfigFixTable
		bind:state
		{disabled}
		{idPrefix}
		{manifestIssues}
		{manifestUninspected}
		{manifestDraftError}
	/>

	<div class:config-fix-legacy-hidden={layout === 'table'} class="config-fix-layout">
		<div class="config-fix-warning-cell">
			{#if manifestIssues.length || manifestDraftError || manifestUninspected || state.undefinedVariableReferences.length}
				<section
					class="config-warnings"
					class:has-fatal={manifestFatal || Boolean(manifestDraftError)}
					aria-labelledby={`${idPrefix}-config-warnings-title`}
				>
					<div class="config-warnings-heading">
						<TriangleAlert size={17} strokeWidth={1.9} aria-hidden="true" />
						<div>
							<h3 id={`${idPrefix}-config-warnings-title`}>Warnings</h3>
							<p>Review these manifest issues before installing.</p>
						</div>
					</div>
					{#if manifestIssues.length}
						<ul>
							{#each manifestIssues as issue (issue.code)}
								<li>{issue.message}</li>
							{/each}
						</ul>
					{:else if manifestUninspected}
						<p class="config-warning-note">
							This manifest was not fetched during discovery. HPM will validate the checked-out file
							before installation.
						</p>
					{/if}
					{#if manifestDraftError}
						<p class="config-warning-error">{manifestDraftError}</p>
					{/if}
					{#if state.undefinedVariableReferences.length}
						<ul>
							{#each state.undefinedVariableReferences as reference (reference)}
								<li>Replace or define <code>{`$${reference}`}</code> before saving.</li>
							{/each}
						</ul>
					{/if}
				</section>
			{/if}
		</div>

		<div class="config-fix-controls">
			{#if state.sourcePathFixCandidates.length || state.pathAliasConflict || state.pathAliasLocationIssue || state.config.path !== undefined}
				<div class="config-fixes-section" aria-labelledby={`${idPrefix}-config-fixes-title`}>
					<div class="config-fixes-heading">
						<div>
							<strong id={`${idPrefix}-config-fixes-title`}>Auto-fixes</strong>
							<p>Choose which detected fixes to apply when saving.</p>
						</div>
					</div>
					{#if state.pathAliasLocationIssue}
						<div
							class="config-fix-option"
							role="button"
							tabindex="0"
							aria-pressed={state.applyPathAliasLocationFix}
							onclick={(event) =>
								toggleFixCard(
									event,
									() => (state.applyPathAliasLocationFix = !state.applyPathAliasLocationFix)
								)}
							onkeydown={(event) =>
								toggleFixCard(
									event,
									() => (state.applyPathAliasLocationFix = !state.applyPathAliasLocationFix)
								)}
						>
							<label class="config-fix-toggle">
								<input type="checkbox" bind:checked={state.applyPathAliasLocationFix} {disabled} />
								<span>Normalize path alias locations</span>
							</label>
							<p class="config-fix-description">
								Move <code>hpath</code> to the JSON root and <code>HOUDINI_PATH</code> into an
								object in
								<code>env[]</code>.
							</p>
						</div>
					{/if}
					{#if state.sourcePathFixCandidates.length}
						<div
							class="config-fix-option"
							role="button"
							tabindex="0"
							aria-pressed={state.applySourcePathFix}
							onclick={(event) =>
								toggleFixCard(event, () => (state.applySourcePathFix = !state.applySourcePathFix))}
							onkeydown={(event) =>
								toggleFixCard(event, () => (state.applySourcePathFix = !state.applySourcePathFix))}
						>
							<label class="config-fix-toggle">
								<input type="checkbox" bind:checked={state.applySourcePathFix} {disabled} />
								<span>Restore source path from another config</span>
							</label>
							<p class="config-fix-description">
								Replace the removed HPM source with a path already used by another config for this
								plugin.
							</p>
							{#if state.sourcePathFixCandidates.length > 1}
								<label class="install-dialog-field config-fix-source-field">
									<span>Existing plugin source</span>
									<select
										aria-label="Existing plugin source"
										bind:value={state.sourcePathFixPath}
										disabled={!state.applySourcePathFix || disabled}
									>
										{#each state.sourcePathFixCandidates as candidate (candidate)}
											<option value={candidate}>{candidate}</option>
										{/each}
									</select>
								</label>
							{:else}
								<code class="config-fix-source-value">{state.sourcePathFixPath}</code>
							{/if}
						</div>
					{/if}
					{#if state.pathAliasConflict}
						<div
							class="config-fix-option"
							role="button"
							tabindex="0"
							aria-pressed={state.applyPathAliasFix}
							onclick={(event) =>
								toggleFixCard(event, () => (state.applyPathAliasFix = !state.applyPathAliasFix))}
							onkeydown={(event) =>
								toggleFixCard(event, () => (state.applyPathAliasFix = !state.applyPathAliasFix))}
						>
							<label class="config-fix-toggle">
								<input type="checkbox" bind:checked={state.applyPathAliasFix} {disabled} />
								<span>Fix duplicate path aliases</span>
							</label>
							<p class="config-fix-description">
								{pathAliasConflictDescription(state.pathAliasConflict)}
							</p>
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
											<span>Replace <code>$hpath</code> with <code>$HOUDINI_PATH</code></span>
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
											<span>Replace <code>$HOUDINI_PATH</code> with <code>$hpath</code></span>
										</label>
									{/if}
								</div>
							{/if}
						</div>
					{/if}
					{#if state.config.path !== undefined}
						<div
							class="config-fix-option"
							role="button"
							tabindex="0"
							aria-pressed={state.migrateLegacyPath}
							onclick={(event) =>
								toggleFixCard(event, () => (state.migrateLegacyPath = !state.migrateLegacyPath))}
							onkeydown={(event) =>
								toggleFixCard(event, () => (state.migrateLegacyPath = !state.migrateLegacyPath))}
						>
							<label class="config-fix-toggle">
								<input type="checkbox" bind:checked={state.migrateLegacyPath} {disabled} />
								<span>Remove deprecated <code>path</code> key</span>
							</label>
							<p class="config-fix-description">
								The deprecated <code>path</code> key will be removed and references will use
								<code>${state.legacyPathAlias}</code>.
							</p>
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
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.install-dialog-field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.install-dialog-field > span {
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 12px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.config-fix-alias-choice {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 9px;
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

	.install-dialog-field select {
		padding: 6px 8px;
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.35);
		color: var(--text);
		cursor: pointer;
	}

	.config-fixes-section {
		display: grid;
		gap: 10px;
		padding: 12px;
		border: 1px solid rgba(211, 155, 56, 0.38);
		border-radius: 5px;
		background: rgba(211, 155, 56, 0.06);
	}

	.config-final-preview-section {
		display: grid;
		gap: 10px;
		padding: 12px;
		border: 1px solid rgba(57, 155, 130, 0.35);
		border-radius: 5px;
		background: rgba(57, 155, 130, 0.06);
	}

	.config-final-preview-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.config-final-preview-heading strong {
		color: #b8ded2;
		font-size: 12px;
	}

	.config-final-preview-heading p {
		margin: 4px 0 0;
		color: var(--text-muted);
		font-size: 11px;
		line-height: 1.4;
	}

	.config-final-preview-toggle {
		display: inline-flex;
		align-items: center;
		flex: 0 0 auto;
		gap: 6px;
		color: var(--text-muted);
		font-size: 11px;
	}

	.config-final-preview-toggle input {
		margin: 0;
		accent-color: #399b82;
	}

	.config-fix-layout {
		display: grid;
		gap: 12px;
	}

	.config-fix-legacy-hidden {
		display: none;
	}

	.config-fix-controls {
		display: grid;
		min-width: 0;
		gap: 10px;
	}

	.config-warnings {
		display: grid;
		gap: 8px;
		padding: 12px;
		border: 1px solid rgba(223, 109, 88, 0.42);
		border-radius: 5px;
		background: rgba(223, 109, 88, 0.08);
	}

	.config-warnings-heading {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		color: #f0a18f;
	}

	.config-warnings-heading h3 {
		margin: 0;
		font-size: 12px;
	}

	.config-warnings-heading p,
	.config-warnings ul {
		margin: 4px 0 0;
		color: var(--text-muted);
		font-size: 12px;
		line-height: 1.45;
	}

	.config-warnings ul {
		padding-left: 24px;
	}

	.config-warning-note,
	.config-warning-error {
		margin: 8px 0 0;
		color: var(--text-muted);
		font-size: 12px;
		line-height: 1.45;
	}

	.config-warning-error {
		color: #ffb09f;
	}

	.config-warnings code,
	.config-fix-description code,
	.config-alias-options code {
		color: #f0c875;
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 0.95em;
	}

	.config-fixes-heading strong {
		color: #f0c875;
		font-size: 12px;
	}

	.config-fixes-heading p,
	.config-fix-description {
		margin: 4px 0 0;
		color: var(--text-muted);
		font-size: 12px;
		line-height: 1.45;
	}

	.config-fix-option {
		display: grid;
		gap: 8px;
		padding: 10px;
		border: 1px solid rgba(211, 155, 56, 0.25);
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.12);
		cursor: pointer;
	}

	.config-fix-option:hover,
	.config-fix-option:focus-visible {
		border-color: rgba(57, 155, 130, 0.55);
		outline: none;
	}

	.config-fix-toggle {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		color: var(--text-dim);
		font-size: 12px;
		font-weight: 600;
		line-height: 1.4;
		cursor: pointer;
	}

	.config-fix-toggle:has(input:checked) {
		color: #b8ded2;
	}

	.config-fix-toggle input {
		width: 14px;
		height: 14px;
		flex: 0 0 auto;
		margin: 1px 0 0;
		accent-color: #399b82;
	}

	.config-fix-source-field {
		gap: 5px;
	}

	.config-fix-source-field select {
		width: 100%;
		min-width: 0;
		padding: 8px 9px;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: var(--surface-raised);
		color: var(--text);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 12px;
	}

	.config-fix-source-field select:focus-visible {
		border-color: #399b82;
		outline: 2px solid rgba(57, 155, 130, 0.24);
		outline-offset: 1px;
	}

	.config-fix-source-value {
		display: block;
		padding: 7px 9px;
		border: 1px solid rgba(211, 155, 56, 0.2);
		border-radius: 4px;
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 12px;
		overflow-wrap: anywhere;
	}

	.config-alias-options {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.config-alias-options label {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 7px 9px;
		border: 1px solid rgba(211, 155, 56, 0.4);
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.12);
		color: var(--text-dim);
		cursor: pointer;
	}

	.config-alias-options label:has(input:checked) {
		border-color: rgba(57, 155, 130, 0.65);
		background: rgba(57, 155, 130, 0.12);
		color: #b8ded2;
	}

	.config-alias-options input {
		margin: 0;
		accent-color: #399b82;
	}
</style>
