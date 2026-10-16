<script lang="ts">
	import { LockKeyhole, RotateCcw } from '@lucide/svelte';
	import {
		diffPreviewLines,
		evaluateConfigVariables,
		highlightJsonTokens,
		type ConfigLockedRange
	} from './config-editor';

	type RenderToken = {
		text: string;
		className?: string;
		lockedRange?: ConfigLockedRange;
	};

	let {
		originalText,
		previewText,
		evaluatedVariables = {},
		loading = false,
		editable = false,
		fillHeight = false,
		disabled = false,
		locked = false,
		lockedRanges = [],
		resetAvailable = false,
		onEdit,
		onReset,
		onLockedRangeHover
	}: {
		originalText: string;
		previewText: string;
		evaluatedVariables?: Record<string, string>;
		loading?: boolean;
		editable?: boolean;
		fillHeight?: boolean;
		disabled?: boolean;
		locked?: boolean;
		lockedRanges?: readonly ConfigLockedRange[];
		resetAvailable?: boolean;
		onEdit?: (text: string) => void;
		onReset?: () => void;
		onLockedRangeHover?: (range: ConfigLockedRange | null) => void;
	} = $props();
	let showRawOriginal = $state(false);
	let showDiff = $state(false);
	let showEvaluatedVariables = $state(false);
	let previewHeight = $state(260);
	let codePreviewElement = $state<HTMLElement | null>(null);
	let controlsDisabled = $derived(disabled || loading);
	let editorDisabled = $derived(controlsDisabled || locked);
	let resetDisabled = $derived(
		controlsDisabled || (!resetAvailable && previewText === originalText)
	);
	let previewLines = $derived(diffPreviewLines(originalText, previewText));
	let evaluatedPreviewText = $derived(evaluateConfigVariables(previewText, evaluatedVariables));
	let canShowEvaluatedVariables = $derived(evaluatedPreviewText !== previewText);
	let normalizedPreviewText = $derived(previewText.replace(/\r\n/g, '\n'));
	let normalizedLockedRanges = $derived(
		lockedRanges.map((range) => ({
			...range,
			start: normalizeOffset(previewText, range.start),
			end: normalizeOffset(previewText, range.end)
		}))
	);

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
		const textarea = event.currentTarget as HTMLTextAreaElement;
		const nextText = textarea.value;
		const changedRange = findChangedRange(normalizedPreviewText, nextText);
		if (changedRange && findLockedRange(changedRange.start, changedRange.end)) {
			textarea.value = normalizedPreviewText;
			return;
		}
		onEdit?.(nextText);
	}

	function rejectLockedEdit(event: InputEvent): void {
		const textarea = event.currentTarget as HTMLTextAreaElement;
		const editRange = inputRange(textarea, event);
		if (!editRange || !findLockedRange(editRange.start, editRange.end)) return;
		event.preventDefault();
	}

	function inputRange(
		textarea: HTMLTextAreaElement,
		event: InputEvent
	): { start: number; end: number } {
		const start = textarea.selectionStart ?? 0;
		const selectionEnd = textarea.selectionEnd ?? start;
		if (event.inputType === 'deleteContentBackward' && start === selectionEnd) {
			return { start: Math.max(0, start - 1), end: start };
		}
		if (event.inputType === 'deleteContentForward' && start === selectionEnd) {
			return { start, end: Math.min(textarea.value.length, start + 1) };
		}
		if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
			return { start: 0, end: textarea.value.length };
		}
		const insertedText = event.data ?? event.dataTransfer?.getData('text/plain') ?? '';
		const insertedLength = insertedText.length || (start === selectionEnd ? 1 : 0);
		return { start, end: Math.max(selectionEnd, start + insertedLength) };
	}

	function findLockedRange(start: number, end: number): ConfigLockedRange | undefined {
		return normalizedLockedRanges.find((range) => start < range.end && end > range.start);
	}

	function findChangedRange(before: string, after: string): { start: number; end: number } | null {
		let start = 0;
		while (start < before.length && start < after.length && before[start] === after[start])
			start += 1;
		if (start === before.length && start === after.length) return null;
		let beforeEnd = before.length;
		let afterEnd = after.length;
		while (beforeEnd > start && afterEnd > start && before[beforeEnd - 1] === after[afterEnd - 1]) {
			beforeEnd -= 1;
			afterEnd -= 1;
		}
		return { start, end: afterEnd };
	}

	function normalizeOffset(text: string, offset: number): number {
		return text.slice(0, offset).replace(/\r\n/g, '\n').length;
	}

	function handleEditorPointerMove(event: PointerEvent): void {
		if (!normalizedLockedRanges.length) return;
		const textarea = event.currentTarget as HTMLTextAreaElement;
		const style = getComputedStyle(textarea);
		const rect = textarea.getBoundingClientRect();
		const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
		const paddingLeft = parseFloat(style.paddingLeft) || 0;
		const paddingTop = parseFloat(style.paddingTop) || 0;
		const canvas = document.createElement('canvas');
		const context = canvas.getContext('2d');
		if (!context) return;
		context.font = style.font;
		const characterWidth = context.measureText('M').width || 1;
		const lineIndex = Math.max(
			0,
			Math.floor((event.clientY - rect.top - paddingTop + textarea.scrollTop) / lineHeight)
		);
		const lines = normalizedPreviewText.split('\n');
		let lineStart = 0;
		for (let index = 0; index < lineIndex && index < lines.length; index += 1) {
			lineStart += lines[index].length + 1;
		}
		const line = lines[Math.min(lineIndex, lines.length - 1)] ?? '';
		const column = Math.max(
			0,
			Math.min(
				line.length,
				Math.round((event.clientX - rect.left - paddingLeft + textarea.scrollLeft) / characterWidth)
			)
		);
		onLockedRangeHover?.(findLockedRange(lineStart + column, lineStart + column + 1) ?? null);
	}

	function clearLockedRangeHover(): void {
		onLockedRangeHover?.(null);
	}

	function previewTokenRuns(text: string, baseOffset = 0): RenderToken[] {
		const runs: RenderToken[] = [];
		let offset = baseOffset;
		for (const token of highlightJsonTokens(text)) {
			const tokenStart = offset;
			const tokenEnd = offset + token.text.length;
			const boundaries = [
				tokenStart,
				tokenEnd,
				...lockedRanges.flatMap((range) =>
					range.start < tokenEnd && range.end > tokenStart
						? [Math.max(tokenStart, range.start), Math.min(tokenEnd, range.end)]
						: []
				)
			].sort((left, right) => left - right);
			for (let index = 0; index < boundaries.length - 1; index += 1) {
				const start = boundaries[index];
				const end = boundaries[index + 1];
				if (end <= start) continue;
				const lockedRange = lockedRanges.find((range) => start < range.end && end > range.start);
				runs.push({
					text: token.text.slice(start - tokenStart, end - tokenStart),
					className: token.className,
					...(lockedRange ? { lockedRange } : {})
				});
			}
			offset = tokenEnd;
		}
		return runs;
	}

	function diffLinePreviewOffset(lineIndex: number): number {
		const previewLineIndex = previewLines
			.slice(0, lineIndex)
			.filter((line) => line.kind !== 'removed').length;
		return previewText
			.split('\n')
			.slice(0, previewLineIndex)
			.reduce((offset, line) => offset + line.length + 1, 0);
	}

	function resetChanges(): void {
		if (resetDisabled) return;
		onReset?.();
	}

	function syncCodeScroll(event: Event): void {
		const textarea = event.currentTarget as HTMLTextAreaElement;
		if (!codePreviewElement) return;
		codePreviewElement.scrollTop = textarea.scrollTop;
		codePreviewElement.scrollLeft = textarea.scrollLeft;
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
			<div class="config-diff-pane">
				<pre class="config-diff-preview config-diff-layer" aria-hidden="true">
					{#each previewLines as line, lineIndex (lineIndex)}
						<span
							class={[
								'config-preview-line',
								line.changed ? 'is-changed' : '',
								line.kind === 'removed' ? 'is-removed' : ''
							]}
							data-diff-kind={line.kind}
							>{#each previewTokenRuns(line.text, diffLinePreviewOffset(lineIndex)) as token, tokenIndex (tokenIndex)}<span
									class={[token.className, token.lockedRange ? 'config-locked-token' : '']}
									role="presentation"
									onpointerenter={() =>
										token.lockedRange && onLockedRangeHover?.(token.lockedRange)}
									onpointerleave={() => token.lockedRange && onLockedRangeHover?.(null)}
									>{token.text}</span
								>{/each}</span
						>
					{/each}
				</pre>
			</div>
			<textarea
				class="config-diff-editor"
				aria-label="Corrected package manifest JSON"
				value={previewText}
				onbeforeinput={rejectLockedEdit}
				oninput={commitEditorText}
				onpointermove={handleEditorPointerMove}
				onpointerleave={clearLockedRangeHover}
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
					)}>{#each previewTokenRuns(previewText || '(empty)') as token, tokenIndex (tokenIndex)}<span
						class={[token.className, token.lockedRange ? 'config-locked-token' : '']}
						role="presentation"
						onpointerenter={() => token.lockedRange && onLockedRangeHover?.(token.lockedRange)}
						onpointerleave={() => token.lockedRange && onLockedRangeHover?.(null)}
						>{token.text}</span
					>{/each}</pre>
			<textarea
				class="config-code-editor"
				aria-label="Corrected package manifest JSON"
				value={previewText}
				onbeforeinput={rejectLockedEdit}
				oninput={commitEditorText}
				onpointermove={handleEditorPointerMove}
				onpointerleave={clearLockedRangeHover}
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
			{#each previewLines as line, lineIndex (lineIndex)}
				<span
					class={[
						'config-preview-line',
						line.changed ? 'is-changed' : '',
						line.kind === 'removed' ? 'is-removed' : ''
					]}
					data-diff-kind={line.kind}
					>{#each previewTokenRuns(line.text, diffLinePreviewOffset(lineIndex)) as token, tokenIndex (tokenIndex)}<span
							class={[token.className, token.lockedRange ? 'config-locked-token' : '']}
							role="presentation"
							onpointerenter={() => token.lockedRange && onLockedRangeHover?.(token.lockedRange)}
							onpointerleave={() => token.lockedRange && onLockedRangeHover?.(null)}
							>{token.text}</span
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

	.config-locked-token {
		border-radius: 2px;
		background: rgba(211, 155, 56, 0.2);
		box-shadow: inset 0 -1px 0 rgba(239, 190, 83, 0.7);
		cursor: not-allowed;
	}

	.config-preview-panel-fill-height .config-editable-diff .config-diff-pane,
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
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		min-height: 260px;
		max-height: min(560px, 58dvh);
		overflow: hidden;
	}

	.config-editable-diff .config-diff-pane,
	.config-editable-diff .config-diff-editor {
		min-width: 0;
		min-height: 0;
		height: 100%;
		max-height: none;
	}

	.config-editable-diff .config-diff-pane {
		overflow: auto;
		border-right: 1px solid var(--line);
		background: rgba(255, 255, 255, 0.018);
	}

	.config-editable-diff .config-diff-editor {
		resize: none;
		background: rgba(0, 0, 0, 0.08);
		caret-color: var(--text);
	}

	.config-editable-diff .config-diff-layer {
		min-height: 100%;
		height: auto;
		overflow: visible;
		resize: none;
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

		.config-editable-diff {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
		}

		.config-editable-diff .config-diff-pane {
			border-right: 0;
			border-bottom: 1px solid var(--line);
		}
	}
</style>
