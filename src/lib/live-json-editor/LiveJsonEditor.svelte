<script lang="ts">
	import { onMount } from 'svelte';
	import { X } from '@lucide/svelte';
	import { runHoudiniPluginAction } from '$lib/houdini/client';
	import { knownIssueKinds } from '$lib/houdini/known-issues';
	import {
		applyPackageConfigFixes,
		type PackageConfigFixPlan
	} from '$lib/houdini/package-config-fixes';
	import type {
		HoudiniDiscoveryResponse,
		HoudiniInstall,
		PackagePathAliasConflict,
		PluginRecord
	} from '$lib/houdini/types';
	import type { ActivationTarget } from '$lib/activation-map/types';

	type EditorState = 'loading' | 'ready' | 'saving' | 'saved' | 'error';
	type ActionState = 'idle' | 'working' | 'success' | 'error';
	type PathAliasResolution =
		'keep-hpath' | 'keep-HOUDINI_PATH' | 'replace-hpath' | 'replace-HOUDINI_PATH' | null;
	type TargetConfigEditor = {
		packagePath: string;
		config: Record<string, unknown>;
		hpath: string;
		sourcePathFixCandidates: string[];
		applySourcePathFix: boolean;
		sourcePathFixPath: string;
		applyPathAliasFix: boolean;
		migrateLegacyPath: boolean;
		pathAliasConflict: PackagePathAliasConflict | null;
		pathAliasResolution: PathAliasResolution;
		state: EditorState;
		message: string;
	};

	let { plugin, install, target, targets, isScanActive, onClose, onDiscovery } = $props<{
		plugin: PluginRecord;
		install: HoudiniInstall;
		target: ActivationTarget;
		targets: ActivationTarget[];
		isScanActive: boolean;
		onClose: () => void;
		onDiscovery: (response: HoudiniDiscoveryResponse) => void;
	}>();

	let editor = $state<TargetConfigEditor>({
		packagePath: '',
		config: {},
		hpath: '',
		sourcePathFixCandidates: [],
		applySourcePathFix: false,
		sourcePathFixPath: '',
		applyPathAliasFix: false,
		migrateLegacyPath: false,
		pathAliasConflict: null,
		pathAliasResolution: null,
		state: 'loading',
		message: ''
	});
	let actionState = $state<ActionState>('idle');

	let targetConfigPreview = $derived.by(() => {
		return JSON.stringify(applyPackageConfigFixes(editor.config, configFixPlan()), null, 2);
	});
	let targetConfigPreviewLines = $derived.by(() => {
		const originalLines = new Set(JSON.stringify(editor.config, null, 2).split('\n'));
		return targetConfigPreview.split('\n').map((text) => ({
			text,
			changed: !originalLines.has(text)
		}));
	});

	onMount(() => {
		editor = createEditor(target);
		void loadConfig();
	});

	function createEditor(currentTarget: ActivationTarget): TargetConfigEditor {
		return {
			packagePath: currentTarget.packagePath ?? '',
			config: {},
			hpath: currentTarget.sourcePaths?.[0] ?? '',
			sourcePathFixCandidates: sourcePathFixCandidates(currentTarget),
			applySourcePathFix: false,
			sourcePathFixPath: '',
			applyPathAliasFix: false,
			migrateLegacyPath: currentTarget.usesLegacyPath ?? false,
			pathAliasConflict: currentTarget.pathAliasConflict ?? null,
			pathAliasResolution: recommendedPathResolution(currentTarget.pathAliasConflict),
			state: 'loading',
			message: ''
		};
	}

	function sourcePathFixCandidates(currentTarget: ActivationTarget): string[] {
		if (!knownIssueKinds(currentTarget).includes('removed-hpm-source')) return [];

		const candidates: string[] = [];
		for (const candidate of targets) {
			if (
				candidate.pluginId === currentTarget.pluginId &&
				candidate.packagePath !== currentTarget.packagePath
			) {
				candidates.push(...(candidate.sourcePaths ?? []));
			}
		}

		return [...new Set(candidates.filter(Boolean))];
	}

	function configHpath(config: Record<string, unknown>, fallback = ''): string {
		if (typeof config.hpath === 'string') return config.hpath;
		if (Array.isArray(config.hpath)) {
			return config.hpath.filter((value): value is string => typeof value === 'string').join('; ');
		}
		if (typeof config.path === 'string') return config.path;
		if (Array.isArray(config.path)) {
			return config.path.filter((value): value is string => typeof value === 'string').join('; ');
		}
		return fallback;
	}

	function effectiveHpath(): string {
		return editor.applySourcePathFix ? editor.sourcePathFixPath : editor.hpath;
	}

	function recommendedPathResolution(
		conflict: PackagePathAliasConflict | null | undefined
	): PathAliasResolution {
		if (!conflict) return null;
		if (conflict.hpathUsedAsVariable && !conflict.houdiniPathUsedAsVariable) return 'keep-hpath';
		if (conflict.houdiniPathUsedAsVariable && !conflict.hpathUsedAsVariable) {
			return 'keep-HOUDINI_PATH';
		}
		return null;
	}

	function pathAliasTarget(resolution: PathAliasResolution): 'hpath' | 'HOUDINI_PATH' | null {
		if (!resolution) return null;
		return resolution.endsWith('hpath') ? 'hpath' : 'HOUDINI_PATH';
	}

	function configFixPlan(): PackageConfigFixPlan {
		const targetAlias = editor.applyPathAliasFix
			? pathAliasTarget(editor.pathAliasResolution)
			: null;

		return {
			hpath: targetAlias === 'HOUDINI_PATH' ? undefined : effectiveHpath(),
			writeHpath: shouldWriteHpath() ? undefined : false,
			migrateLegacyPath: editor.migrateLegacyPath,
			preservePathAliases: editor.pathAliasConflict ? !editor.applyPathAliasFix : undefined,
			keepPathAlias:
				editor.applyPathAliasFix && editor.pathAliasResolution?.startsWith('keep-')
					? targetAlias!
					: undefined,
			replacePathAlias:
				editor.applyPathAliasFix && editor.pathAliasResolution?.startsWith('replace-')
					? targetAlias!
					: undefined
		};
	}

	function shouldWriteHpath(): boolean {
		return (
			editor.applySourcePathFix ||
			editor.applyPathAliasFix ||
			editor.migrateLegacyPath ||
			editor.config.hpath !== undefined ||
			editor.hpath.trim() !== configHpath(editor.config, target.sourcePaths?.[0] ?? '').trim()
		);
	}

	function pathAliasConflictDescription(conflict: PackagePathAliasConflict): string {
		if (conflict.hpathUsedAsVariable && conflict.houdiniPathUsedAsVariable) {
			return 'Both aliases are referenced as variable dependencies. Choose which alias to keep, and references to the other alias will be updated.';
		}
		if (conflict.hpathUsedAsVariable) {
			return 'hpath is referenced as a variable dependency. Keep it, or replace its references with HOUDINI_PATH before removing it.';
		}
		if (conflict.houdiniPathUsedAsVariable) {
			return 'HOUDINI_PATH is referenced as a variable dependency. Keep it, or replace its references with hpath before removing it.';
		}
		return 'Neither alias is referenced as a variable dependency. Choose which alias to keep before saving.';
	}

	async function loadConfig() {
		try {
			const result = await runHoudiniPluginAction({
				pluginId: plugin.id,
				action: 'get-config',
				installId: install.id
			});
			const config = result.config ?? {};
			editor.config = config;
			editor.hpath = configHpath(config, target.sourcePaths?.[0] ?? '');
			editor.sourcePathFixPath = editor.sourcePathFixCandidates[0] ?? '';
			editor.migrateLegacyPath = false;
			editor.state = 'ready';
		} catch (error) {
			editor.state = 'error';
			editor.message = getErrorMessage(error);
		}
	}

	function closeEditor() {
		if (editor.state === 'saving') return;
		onClose();
	}

	async function openTargetConfigFile() {
		if (isScanActive || actionState === 'working' || editor.state === 'saving') return;

		actionState = 'working';
		try {
			await runHoudiniPluginAction({
				pluginId: plugin.id,
				action: 'open-config',
				installId: install.id
			});
			actionState = 'success';
		} catch (error) {
			actionState = 'error';
			editor.message = getErrorMessage(error);
			editor.state = 'error';
		}
	}

	async function saveTargetConfig() {
		if (
			isScanActive ||
			(!effectiveHpath().trim() &&
				(!editor.applyPathAliasFix ||
					pathAliasTarget(editor.pathAliasResolution) !== 'HOUDINI_PATH')) ||
			(editor.applyPathAliasFix && editor.pathAliasConflict && !editor.pathAliasResolution) ||
			editor.state === 'saving'
		)
			return;

		editor.state = 'saving';
		editor.message = '';
		const fixPlan = configFixPlan();
		try {
			const result = await runHoudiniPluginAction({
				pluginId: plugin.id,
				action: 'update-config',
				installId: install.id,
				...fixPlan
			});
			if (result.discovery) onDiscovery(result.discovery);
			editor.config = applyPackageConfigFixes(editor.config, fixPlan);
			editor.hpath = effectiveHpath().trim();
			editor.state = 'saved';
			editor.message = result.message;
			closeEditor();
		} catch (error) {
			editor.state = 'error';
			editor.message = getErrorMessage(error);
		}
	}

	function getErrorMessage(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}
</script>

<div class="issues-dialog-backdrop">
	<button
		type="button"
		class="issues-dialog-dismiss"
		aria-label="Close Live JSON Editor dialog"
		disabled={editor.state === 'saving'}
		onclick={closeEditor}
	></button>
	<dialog open class="issues-dialog target-config-dialog" aria-labelledby="target-config-title">
		<div class="issues-dialog-header">
			<div>
				<h2 id="target-config-title">Live JSON Editor</h2>
				<p>{plugin.name} / {install.label}</p>
			</div>
			<button
				type="button"
				class="dialog-close-button"
				aria-label="Close Live JSON Editor dialog"
				disabled={editor.state === 'saving'}
				onclick={closeEditor}
			>
				<X size={18} strokeWidth={1.8} aria-hidden="true" />
			</button>
		</div>
		<div class="target-config-content">
			{#if editor.sourcePathFixCandidates.length || editor.pathAliasConflict || editor.config.path !== undefined}
				<div class="config-fixes-section" aria-labelledby="config-fixes-title">
					<div class="config-fixes-heading">
						<div>
							<strong id="config-fixes-title">Auto-fixes</strong>
							<p>Choose which detected fixes to apply when saving.</p>
						</div>
					</div>
					{#if editor.sourcePathFixCandidates.length}
						<div class="config-fix-option">
							<label class="config-fix-toggle">
								<input
									type="checkbox"
									bind:checked={editor.applySourcePathFix}
									disabled={editor.state === 'loading' || editor.state === 'saving'}
								/>
								<span>Restore source path from another config</span>
							</label>
							<p class="config-fix-description">
								Replace the removed HPM source with a path already used by another config for this
								plugin.
							</p>
							{#if editor.sourcePathFixCandidates.length > 1}
								<label class="install-dialog-field config-fix-source-field">
									<span>Existing plugin source</span>
									<select
										aria-label="Existing plugin source"
										bind:value={editor.sourcePathFixPath}
										disabled={!editor.applySourcePathFix || editor.state === 'saving'}
									>
										{#each editor.sourcePathFixCandidates as candidate (candidate)}
											<option value={candidate}>{candidate}</option>
										{/each}
									</select>
								</label>
							{:else}
								<code class="config-fix-source-value">{editor.sourcePathFixPath}</code>
							{/if}
						</div>
					{/if}
					{#if editor.pathAliasConflict}
						<div class="config-fix-option">
							<label class="config-fix-toggle">
								<input
									type="checkbox"
									bind:checked={editor.applyPathAliasFix}
									disabled={editor.state === 'loading' || editor.state === 'saving'}
								/>
								<span>Fix duplicate path aliases</span>
							</label>
							<p class="config-fix-description">
								{pathAliasConflictDescription(editor.pathAliasConflict)}
							</p>
							{#if editor.applyPathAliasFix}
								<div
									class="config-alias-options"
									role="radiogroup"
									aria-label="Path alias resolution"
								>
									{#if !editor.pathAliasConflict.houdiniPathUsedAsVariable}
										<label>
											<input
												type="radio"
												name={`path-alias-${install.id}`}
												value="keep-hpath"
												bind:group={editor.pathAliasResolution}
												disabled={editor.state === 'loading' || editor.state === 'saving'}
											/>
											<span>Keep <code>hpath</code></span>
										</label>
									{/if}
									{#if !editor.pathAliasConflict.hpathUsedAsVariable}
										<label>
											<input
												type="radio"
												name={`path-alias-${install.id}`}
												value="keep-HOUDINI_PATH"
												bind:group={editor.pathAliasResolution}
												disabled={editor.state === 'loading' || editor.state === 'saving'}
											/>
											<span>Keep <code>HOUDINI_PATH</code></span>
										</label>
									{/if}
									{#if editor.pathAliasConflict.hpathUsedAsVariable}
										<label>
											<input
												type="radio"
												name={`path-alias-${install.id}`}
												value="replace-HOUDINI_PATH"
												bind:group={editor.pathAliasResolution}
												disabled={editor.state === 'loading' || editor.state === 'saving'}
											/>
											<span>Replace <code>$hpath</code> with <code>$HOUDINI_PATH</code></span>
										</label>
									{/if}
									{#if editor.pathAliasConflict.houdiniPathUsedAsVariable}
										<label>
											<input
												type="radio"
												name={`path-alias-${install.id}`}
												value="replace-hpath"
												bind:group={editor.pathAliasResolution}
												disabled={editor.state === 'loading' || editor.state === 'saving'}
											/>
											<span>Replace <code>$HOUDINI_PATH</code> with <code>$hpath</code></span>
										</label>
									{/if}
								</div>
							{/if}
						</div>
					{/if}
					{#if editor.config.path !== undefined}
						<div class="config-fix-option">
							<label class="config-fix-toggle">
								<input
									type="checkbox"
									bind:checked={editor.migrateLegacyPath}
									disabled={editor.state === 'loading' || editor.state === 'saving'}
								/>
								<span>Remove deprecated <code>path</code> key</span>
							</label>
							<p class="config-fix-description">
								The deprecated <code>path</code> key will be removed and replaced with
								<code>hpath</code>.
							</p>
						</div>
					{/if}
				</div>
			{/if}
			<label class="install-dialog-field">
				<span><code>hpath</code> Local plugin source</span>
				<input
					class="config-source-input"
					type="text"
					aria-label="Local plugin source (hpath)"
					bind:value={editor.hpath}
					disabled={editor.state === 'loading' ||
						editor.state === 'saving' ||
						editor.applySourcePathFix ||
						(editor.applyPathAliasFix &&
							pathAliasTarget(editor.pathAliasResolution) === 'HOUDINI_PATH')}
					placeholder={`C:\\Plugins\\${plugin.name}`}
				/>
			</label>
			<div class="config-preview-panel">
				<div class="config-preview-heading">
					<span>Live JSON preview</span>
					<code>{editor.packagePath}</code>
				</div>
				<pre>{#if editor.state === 'loading'}Loading config...{:else}{#each targetConfigPreviewLines as line (line)}<span
								class={line.changed ? 'config-preview-line is-changed' : 'config-preview-line'}
								>{line.text}</span
							>{/each}{/if}</pre>
			</div>
			{#if editor.message}
				<p
					class={['install-message', `is-${editor.state === 'error' ? 'error' : 'success'}`]}
					aria-live="polite"
				>
					{editor.message}
				</p>
			{/if}
		</div>
		<div class="editor-actions">
			<button
				type="button"
				class="dialog-secondary-button"
				disabled={editor.state === 'saving'}
				onclick={closeEditor}
			>
				Cancel
			</button>
			<button
				type="button"
				class="dialog-secondary-button"
				disabled={editor.state === 'loading' ||
					editor.state === 'saving' ||
					actionState === 'working' ||
					isScanActive}
				onclick={() => void openTargetConfigFile()}
			>
				Open config file
			</button>
			<button
				type="button"
				class="dialog-primary-button"
				disabled={editor.state === 'loading' ||
					editor.state === 'saving' ||
					(!effectiveHpath().trim() &&
						(!editor.applyPathAliasFix ||
							pathAliasTarget(editor.pathAliasResolution) !== 'HOUDINI_PATH')) ||
					(editor.applyPathAliasFix && editor.pathAliasConflict && !editor.pathAliasResolution)}
				onclick={() => void saveTargetConfig()}
			>
				{editor.state === 'saving' ? 'Saving...' : 'Save and close'}
			</button>
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

	.target-config-dialog {
		width: min(760px, 100%);
	}

	.target-config-content {
		display: flex;
		min-height: 0;
		flex-direction: column;
		gap: 16px;
		margin: 20px 0;
	}

	.install-dialog-field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.install-dialog-field > span {
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 8px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.config-source-input {
		width: 100%;
		min-width: 0;
		padding: 9px 10px;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: var(--surface-raised);
		color: var(--text);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 11px;
	}

	.config-source-input:focus-visible {
		border-color: #399b82;
		outline: none;
	}

	.config-fixes-section {
		display: grid;
		gap: 10px;
		padding: 12px;
		border: 1px solid rgba(211, 155, 56, 0.38);
		border-radius: 5px;
		background: rgba(211, 155, 56, 0.06);
	}

	.config-fixes-heading strong {
		color: #f0c875;
		font-size: 12px;
	}

	.config-fixes-heading p,
	.config-fix-description {
		margin: 4px 0 0;
		color: var(--text-muted);
		font-size: 11px;
		line-height: 1.45;
	}

	.config-fix-option {
		display: grid;
		gap: 8px;
		padding: 10px;
		border: 1px solid rgba(211, 155, 56, 0.25);
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.12);
	}

	.config-fix-toggle {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		color: var(--text-dim);
		font-size: 11px;
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

	.config-fix-description code,
	.config-alias-options code {
		color: #f0c875;
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 0.95em;
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
		font-size: 11px;
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
		font-size: 10px;
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

	.config-preview-panel {
		min-width: 0;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: rgba(0, 0, 0, 0.14);
		overflow: hidden;
	}

	.config-preview-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 9px 11px;
		border-bottom: 1px solid var(--line);
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
	}

	.config-preview-heading code {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.config-preview-panel pre {
		max-height: min(360px, 42dvh);
		margin: 0;
		overflow: auto;
		padding: 12px;
		color: var(--text);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 11px;
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.config-preview-line {
		display: block;
		min-height: 1.5em;
		margin: 0 -4px;
		padding: 0 4px;
	}

	.config-preview-line.is-changed {
		background: rgba(74, 164, 132, 0.2);
		box-shadow: inset 3px 0 #55b79d;
	}

	.editor-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}

	.dialog-secondary-button,
	.dialog-primary-button {
		min-height: 34px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 5px;
		font: inherit;
		font-size: 11px;
		cursor: pointer;
	}

	.dialog-secondary-button {
		background: transparent;
		color: var(--text-muted);
	}

	.dialog-primary-button {
		border-color: rgba(211, 155, 56, 0.18);
		background: rgba(211, 155, 56, 0.1);
		color: rgba(211, 155, 56, 1);
	}

	.dialog-secondary-button:hover,
	.dialog-secondary-button:focus-visible,
	.dialog-primary-button:hover:not(:disabled),
	.dialog-primary-button:focus-visible:not(:disabled) {
		border-color: #e7d6ae;
		outline: none;
	}

	.dialog-primary-button:hover:not(:disabled),
	.dialog-primary-button:focus-visible:not(:disabled) {
		background: rgba(211, 155, 56, 0.18);
	}

	.dialog-primary-button:disabled {
		cursor: wait;
		opacity: 0.55;
	}

	.install-message {
		margin: 0;
		color: var(--text-muted);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
		line-height: 1.45;
	}

	.install-message.is-success {
		color: #399b82;
	}

	.install-message.is-error {
		color: #df6d58;
	}

	@media (max-width: 760px) {
		.issues-dialog-backdrop {
			padding: 12px;
		}

		.issues-dialog {
			max-height: calc(100dvh - 24px);
			padding: 17px;
		}

		.issues-dialog-header {
			gap: 12px;
		}

		.issues-dialog-header h2 {
			font-size: 19px;
		}

		.editor-actions {
			flex-wrap: wrap;
		}

		.editor-actions button {
			flex: 1 1 auto;
		}
	}
</style>
