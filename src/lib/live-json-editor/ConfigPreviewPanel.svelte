<script lang="ts">
	import { LockKeyhole, RotateCcw } from '@lucide/svelte';
	import { diffPreviewLines, evaluateConfigVariables, highlightJsonTokens } from './config-editor';

	let {
		originalText,
		previewText,
		evaluatedVariables = {},
		loading = false,
		editable = false,
		fillHeight = false,
		disabled = false,
		locked = false,
		onEdit,
		onReset
	}: {
		originalText: string;
		previewText: string;
		evaluatedVariables?: Record<string, string>;
		loading?: boolean;
		editable?: boolean;
		fillHeight?: boolean;
		disabled?: boolean;
		locked?: boolean;
		onEdit?: (text: string) => void;
		onReset?: () => void;
	} = $props();
	let showRawOriginal = $state(false);
	let showDiff = $state(true);
	let showEvaluatedVariables = $state(false);
	let previewHeight = $state(260);
	let diffPreviewElement = $state<HTMLElement | null>(null);
	let codePreviewElement = $state<HTMLElement | null>(null);
	let controlsDisabled = $derived(disabled || loading);
	let editorDisabled = $derived(controlsDisabled || locked);
	let resetDisabled = $derived(controlsDisabled || previewText === originalText);
	let previewLines = $derived(diffPreviewLines(originalText, previewText));
	let evaluatedPreviewText = $derived(evaluateConfigVariables(previewText, evaluatedVariables));
	let canShowEvaluatedVariables = $derived(evaluatedPreviewText !== previewText);

	function syncPreviewHeight(node: HTMLElement, height: number) {
		node.style.removeProperty('height');
		if (fillHeight) return;
		node.style.height = `${height}px`;
		const observer = new ResizeObserver(([entry]) => {
			const borderBoxSize = Array.isArray(entry.borderBoxSize)
				? entry.borderBoxSize[0]
				: entry.borderBoxSize;
			const nextHeight = borderBoxSize?.blockSize ?? entry.contentRect.height;
			if (Math.abs(nextHeight - previewHeight) > 1) previewHeight = nextHeight;
		});
		observer.observe(node);

		return () => observer.disconnect();
	}

	function commitEditorText(event: Event): void {
		onEdit?.((event.currentTarget as HTMLTextAreaElement).value);
	}

	function resetChanges(): void {
		if (resetDisabled) return;
		onReset?.();
	}

	function syncDiffScroll(event: Event): void {
		const textarea = event.currentTarget as HTMLTextAreaElement;
		if (!diffPreviewElement) return;
		diffPreviewElement.scrollTop = textarea.scrollTop;
		diffPreviewElement.scrollLeft = textarea.scrollLeft;
	}

	function syncCodeScroll(event: Event): void {
		const textarea = event.currentTarget as HTMLTextAreaElement;
		if (!codePreviewElement) return;
		codePreviewElement.scrollTop = textarea.scrollTop;
		codePreviewElement.scrollLeft = textarea.scrollLeft;
	}

	function attachDiffPreview(node: HTMLElement) {
		diffPreviewElement = node;
		return () => {
			if (diffPreviewElement === node) diffPreviewElement = null;
		};
	}

	function attachCodePreview(node: HTMLElement) {
		codePreviewElement = node;
		return () => {
			if (codePreviewElement === node) codePreviewElement = null;
		};
	}

	function toggleDiff(event: Event): void {
		showDiff = (event.currentTarget as HTMLInputElement).checked;
		if (showDiff) {
			showRawOriginal = false;
			showEvaluatedVariables = false;
		}
	}

	function toggleRawOriginal(event: Event): void {
		showRawOriginal = (event.currentTarget as HTMLInputElement).checked;
		if (showRawOriginal) {
			showDiff = false;
			showEvaluatedVariables = false;
		}
	}

	function toggleEvaluatedVariables(event: Event): void {
		showEvaluatedVariables = (event.currentTarget as HTMLInputElement).checked;
		if (showEvaluatedVariables) {
			showDiff = false;
			showRawOriginal = false;
		}
	}
</script>

<div
	class:config-preview-panel-fill-height={fillHeight}
	class:config-preview-panel-locked={locked}
	class="config-preview-panel mb-2"
>
	<div class="config-preview-heading">
		<div class="config-preview-toggles">
			{#if editable || onReset}
				<button
					type="button"
					class="config-preview-reset"
					disabled={resetDisabled}
					title="Reset changes"
					aria-label="Reset changes"
					onclick={resetChanges}
				>
					<RotateCcw size={13} strokeWidth={1.9} aria-hidden="true" />
					<span>Reset changes</span>
				</button>
			{/if}
			<label class="config-preview-toggle">
				<input
					type="checkbox"
					checked={showDiff}
					onchange={toggleDiff}
					disabled={controlsDisabled}
				/>
				<span>Show diff</span>
			</label>
			{#if editable}
				<label class="config-preview-toggle">
					<input
						type="checkbox"
						checked={showRawOriginal}
						onchange={toggleRawOriginal}
						disabled={controlsDisabled}
					/>
					<span>Show raw</span>
				</label>
			{/if}
			<label class="config-preview-toggle">
				<input
					type="checkbox"
					checked={showEvaluatedVariables}
					onchange={toggleEvaluatedVariables}
					disabled={controlsDisabled || !canShowEvaluatedVariables}
				/>
				<span>Show evaluated</span>
			</label>
			{#if locked}
				<span
					class="config-preview-lock"
					title="Config editing is locked while an autofix is enabled"
					aria-label="Config editing is locked while an autofix is enabled"
					role="img"
				>
					<LockKeyhole size={14} aria-hidden="true" />
				</span>
			{/if}
		</div>
	</div>
	{#if loading}
		<pre {@attach (node) => syncPreviewHeight(node, previewHeight)}>Loading config...</pre>
	{:else if editable && showRawOriginal}
		<pre
			class="config-raw-original"
			{@attach (node) =>
				syncPreviewHeight(
					node,
					previewHeight
				)}>{#each highlightJsonTokens(originalText || '(empty)') as token, tokenIndex (tokenIndex)}<span
					class={token.className}>{token.text}</span
				>{/each}</pre>
	{:else if showEvaluatedVariables}
		<pre
			class="config-plain-preview"
			{@attach (node) =>
				syncPreviewHeight(
					node,
					previewHeight
				)}>{#each highlightJsonTokens(evaluatedPreviewText || '(empty)') as token, tokenIndex (tokenIndex)}<span
					class={token.className}>{token.text}</span
				>{/each}</pre>
	{:else if editable && showDiff}
		<div class="config-editable-diff" style:height={`${previewHeight}px`}>
			<pre
				class="config-diff-preview config-diff-layer"
				aria-hidden="true"
				{@attach attachDiffPreview}
				{@attach (node) => syncPreviewHeight(node, previewHeight)}>
				{#each previewLines as line (line)}
					<span
						class={[
							'config-preview-line',
							line.changed ? 'is-changed' : '',
							line.kind === 'removed' ? 'is-removed' : ''
						]}
						data-diff-kind={line.kind}
						>{#each highlightJsonTokens(line.text) as token, tokenIndex (tokenIndex)}<span
								class={token.className}>{token.text}</span
							>{/each}</span
					>
				{/each}
			</pre>
			<textarea
				class="config-diff-editor"
				aria-label="Corrected package manifest JSON"
				value={previewText}
				oninput={commitEditorText}
				onscroll={syncDiffScroll}
				disabled={editorDisabled}
				spellcheck="false"
				{@attach (node) => syncPreviewHeight(node, previewHeight)}></textarea>
		</div>
	{:else if editable}
		<div class="config-editable-code" style:height={`${previewHeight}px`}>
			<pre
				class="config-code-preview"
				aria-hidden="true"
				{@attach attachCodePreview}
				{@attach (node) =>
					syncPreviewHeight(
						node,
						previewHeight
					)}>{#each highlightJsonTokens(previewText || '(empty)') as token, tokenIndex (tokenIndex)}<span
						class={token.className}>{token.text}</span
					>{/each}</pre>
			<textarea
				class="config-code-editor"
				aria-label="Corrected package manifest JSON"
				value={previewText}
				oninput={commitEditorText}
				onscroll={syncCodeScroll}
				disabled={editorDisabled}
				spellcheck="false"
				{@attach (node) => syncPreviewHeight(node, previewHeight)}></textarea>
		</div>
	{:else if !showDiff}
		<pre
			class="config-plain-preview"
			{@attach (node) =>
				syncPreviewHeight(
					node,
					previewHeight
				)}>{#each highlightJsonTokens(previewText || '(empty)') as token, tokenIndex (tokenIndex)}<span
					class={token.className}>{token.text}</span
				>{/each}</pre>
	{:else}
		<pre
			class="config-diff-preview"
			aria-label="Configuration diff"
			{@attach (node) => syncPreviewHeight(node, previewHeight)}>
			{#each previewLines as line (line)}
				<span
					class={[
						'config-preview-line',
						line.changed ? 'is-changed' : '',
						line.kind === 'removed' ? 'is-removed' : ''
					]}
					data-diff-kind={line.kind}
					>{#each highlightJsonTokens(line.text) as token, tokenIndex (tokenIndex)}<span
							class={token.className}>{token.text}</span
						>{/each}</span
				>
			{/each}
		</pre>
	{/if}
</div>

<style>
	.config-preview-panel {
		min-width: 0;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: rgba(0, 0, 0, 0.14);
		overflow: hidden;
	}

	.config-preview-panel-fill-height {
		display: flex;
		min-height: 0;
		flex: 1 1 auto;
		flex-direction: column;
	}

	.config-preview-heading {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 9px 11px;
		border-bottom: 1px solid var(--line);
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 12px;
	}

	.config-preview-heading > div {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 12px;
	}

	.config-preview-heading > div:first-child {
		width: 100%;
		align-items: flex-start;
		gap: 3px;
	}

	.config-preview-toggles {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		flex-wrap: wrap;
		gap: 6px;
		width: 100%;
	}

	.config-preview-toggle {
		display: flex;
		align-items: center;
		flex: 0 0 auto;
		gap: 6px;
		padding: 4px 6px;
		border: 1px solid transparent;
		border-radius: 4px;
		color: var(--text-muted);
		font-family: inherit;
		font-size: 11px;
		cursor: pointer;
	}

	.config-preview-toggle:hover,
	.config-preview-toggle:has(input:focus-visible) {
		border-color: var(--line);
		background: rgba(57, 155, 130, 0.08);
		color: var(--text);
	}

	.config-preview-toggle:has(input:checked) {
		border-color: rgba(57, 155, 130, 0.35);
		color: #b8ded2;
	}

	.config-preview-toggle input {
		margin: 0;
		accent-color: #399b82;
	}

	.config-preview-reset {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 4px 6px;
		border: 1px solid transparent;
		border-radius: 4px;
		background: transparent;
		color: var(--text-muted);
		font: inherit;
		font-size: 11px;
		cursor: pointer;
	}

	.config-preview-reset:hover:not(:disabled),
	.config-preview-reset:focus-visible:not(:disabled) {
		border-color: var(--line);
		background: rgba(57, 155, 130, 0.08);
		color: var(--text);
		outline: none;
	}

	.config-preview-reset:disabled {
		cursor: default;
		opacity: 0.45;
	}

	.config-preview-panel pre {
		box-sizing: border-box;
		min-height: 260px;
		max-height: min(560px, 58dvh);
		margin: 0;
		overflow: auto;
		resize: vertical;
		color: var(--text);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 12px;
		line-height: 1.5;
		padding: 8px 16px;
		word-break: break-word;
	}

	.config-plain-preview {
		background: rgba(255, 255, 255, 0.018);
	}

	.config-diff-preview {
		font-size: 12px;
		white-space: normal;
	}

	.config-preview-panel textarea {
		box-sizing: border-box;
		display: block;
		width: 100%;
		min-height: 260px;
		max-height: min(560px, 58dvh);
		margin: 0;
		resize: vertical;
		border: 0;
		padding: 8px 16px;
		background: transparent;
		color: var(--text);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 12px;
		line-height: 1.5;
		white-space: pre;
	}

	.config-preview-panel-fill-height > pre,
	.config-preview-panel-fill-height > .config-editable-code,
	.config-preview-panel-fill-height > .config-editable-diff {
		box-sizing: border-box;
		min-height: 0;
		height: auto !important;
		max-height: none;
		flex: 1 1 0;
	}

	.config-editable-code {
		position: relative;
		min-height: 260px;
		max-height: min(560px, 58dvh);
		overflow: hidden;
	}

	.config-editable-code .config-code-preview,
	.config-editable-code .config-code-editor {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		max-height: none;
	}

	.config-editable-code .config-code-preview {
		overflow: hidden;
	}

	.config-editable-code .config-code-editor {
		z-index: 1;
		background: transparent;
		color: transparent;
		caret-color: var(--text);
		-webkit-text-fill-color: transparent;
	}

	.config-preview-panel-fill-height .config-editable-code .config-code-preview,
	.config-preview-panel-fill-height .config-editable-code .config-code-editor {
		min-height: 0;
		height: 100% !important;
		max-height: none;
	}

	.json-token-key {
		color: #86c7e8;
	}

	.json-token-string {
		color: #c8d99b;
	}

	.json-token-number {
		color: #e6b878;
	}

	.json-token-boolean {
		color: #d9a7df;
	}

	.json-token-null {
		color: #a9a9b8;
	}

	.json-token-comment {
		color: var(--text-muted);
		font-style: italic;
	}

	.config-preview-panel-fill-height .config-editable-diff .config-diff-layer,
	.config-preview-panel-fill-height .config-editable-diff .config-diff-editor {
		min-height: 0;
		height: 100% !important;
		max-height: none;
	}

	.config-preview-panel textarea:focus-visible {
		outline: 2px solid rgba(57, 155, 130, 0.55);
		outline-offset: -2px;
	}

	.config-preview-panel-locked .config-code-editor,
	.config-preview-panel-locked .config-diff-editor {
		cursor: not-allowed;
	}

	.config-preview-lock {
		display: inline-flex;
		align-items: center;
		flex: 0 0 auto;
		margin: 4px 2px 0 auto;
		color: #e6b878;
		cursor: help;
	}

	.config-editable-diff {
		position: relative;
		min-height: 260px;
		max-height: min(560px, 58dvh);
		overflow: hidden;
	}

	.config-editable-diff .config-diff-layer,
	.config-editable-diff .config-diff-editor {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		max-height: none;
	}

	.config-editable-diff .config-diff-layer {
		pointer-events: none;
		overflow: hidden;
	}

	.config-editable-diff .config-diff-editor {
		z-index: 1;
		background: transparent;
		color: transparent;
		caret-color: var(--text);
		-webkit-text-fill-color: transparent;
	}

	.config-raw-original {
		max-height: min(560px, 58dvh) !important;
	}

	.config-preview-line {
		display: block;
		position: relative;
		min-height: 1.5em;
		margin: 0 -4px;
		padding: 0 4px;
		font-size: 12px;
		line-height: 1.5;
		white-space: pre-wrap;
	}

	.config-preview-line.is-changed {
		background: rgba(74, 164, 132, 0.2);
		box-shadow: inset 3px 0 #55b79d;
	}

	.config-preview-line.is-changed::before,
	.config-preview-line.is-removed::before {
		position: absolute;
		left: -1.15em;
		width: 1em;
		pointer-events: none;
		font-weight: 700;
		text-align: right;
	}

	.config-preview-line.is-changed::before {
		content: '+';
		color: #77d1b4;
	}

	.config-preview-line.is-removed {
		background: rgba(211, 79, 73, 0.2);
		box-shadow: inset 3px 0 #e06c67;
		color: #ffc1bc;
	}

	.config-preview-line.is-removed::before {
		content: '-';
		color: #ff9089;
	}

	@media (max-width: 620px) {
		.config-preview-heading {
			align-items: flex-start;
			flex-direction: column;
		}

		.config-preview-heading > div {
			width: 100%;
		}

		.config-preview-toggles {
			justify-content: flex-start;
		}
	}
</style>
