<script lang="ts">
	import { onMount } from 'svelte';
	import { X } from '@lucide/svelte';
	import { runHoudiniPluginAction } from '$lib/houdini/client';
	import { knownIssueKinds } from '$lib/houdini/known-issues';
	import { applyPackageConfigFixes } from '$lib/houdini/package-config-fixes';
	import type { HoudiniDiscoveryResponse, HoudiniInstall, PluginRecord } from '$lib/houdini/types';
	import type { ActivationTarget } from '$lib/activation-map/types';
	import ConfigFixesPanel from './ConfigFixesPanel.svelte';
	import ConfigPreviewPanel from './ConfigPreviewPanel.svelte';
	import {
		configFixPlan,
		configHpath,
		correctedConfigText,
		createConfigFixState,
		effectiveHpath,
		configuredPathAlias,
		type ConfigFixState
	} from './config-editor';

	type EditorState = 'loading' | 'ready' | 'saving' | 'saved' | 'error';
	type ActionState = 'idle' | 'working' | 'success' | 'error';
	type TargetConfigEditor = ConfigFixState & {
		packagePath: string;
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
		...createConfigFixState({}, { defaultHpath: '' }),
		state: 'loading',
		message: ''
	});
	let actionState = $state<ActionState>('idle');

	let targetConfigPreview = $derived(correctedConfigText(editor));

	onMount(() => {
		editor = createEditor(target);
		void loadConfig();
	});

	function createEditor(currentTarget: ActivationTarget): TargetConfigEditor {
		const configState = createConfigFixState(
			{},
			{
				defaultHpath: currentTarget.sourcePaths?.[0] ?? '',
				sourcePathFixCandidates: sourcePathFixCandidates(currentTarget),
				pathAliasConflict: currentTarget.pathAliasConflict ?? null,
				pathAliasLocationIssue: currentTarget.pathAliasLocationIssue ?? null,
				undefinedVariableReferences: currentTarget.undefinedVariableReferences ?? [],
				migrateLegacyPath: currentTarget.usesLegacyPath ?? false
			}
		);

		return {
			packagePath: currentTarget.packagePath ?? '',
			...configState,
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

	async function loadConfig() {
		try {
			const result = await runHoudiniPluginAction({
				pluginId: plugin.id,
				action: 'get-config',
				installId: install.id
			});
			const config = result.config ?? {};
			const pathAlias = configuredPathAlias(config, editor.pathAliasConflict);
			editor.config = config;
			editor.pathAlias = pathAlias;
			editor.originalPathAlias = pathAlias;
			editor.hpath = configHpath(config, target.sourcePaths?.[0] ?? '', pathAlias);
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

	function resetChanges() {
		const configState = createConfigFixState(editor.config, {
			defaultHpath: target.sourcePaths?.[0] ?? '',
			sourcePathFixCandidates: editor.sourcePathFixCandidates,
			pathAliasConflict: editor.pathAliasConflict,
			pathAliasLocationIssue: editor.pathAliasLocationIssue,
			undefinedVariableReferences: editor.undefinedVariableReferences,
			migrateLegacyPath: editor.config.path !== undefined
		});
		configState.applyPathAliasLocationFix = false;
		configState.migrateLegacyPath = false;
		editor = { ...editor, ...configState, message: '' };
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
			!effectiveHpath(editor).trim() ||
			(editor.applyPathAliasFix && editor.pathAliasConflict && !editor.pathAliasResolution) ||
			editor.state === 'saving'
		)
			return;

		editor.state = 'saving';
		editor.message = '';
		const fixPlan = configFixPlan(editor);
		try {
			const result = await runHoudiniPluginAction({
				pluginId: plugin.id,
				action: 'update-config',
				installId: install.id,
				...fixPlan
			});
			if (result.discovery) onDiscovery(result.discovery);
			editor.config = applyPackageConfigFixes(editor.config, fixPlan);
			editor.hpath = effectiveHpath(editor).trim();
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
			<ConfigFixesPanel
				bind:state={editor}
				disabled={editor.state === 'loading' || editor.state === 'saving'}
				idPrefix={`live-${install.id}`}
			/>
			<ConfigPreviewPanel
				originalText={JSON.stringify(editor.config, null, 2)}
				previewText={targetConfigPreview}
				packagePath={editor.packagePath}
				onReset={resetChanges}
				loading={editor.state === 'loading'}
			/>
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
					!effectiveHpath(editor).trim() ||
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
		font-size: 12px;
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
		font-size: 12px;
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
