<script lang="ts">
	import { Check, Copy, X } from '@lucide/svelte';

	let { installLabel, hconfigOutput, isWorking, onClose } = $props<{
		installLabel: string;
		hconfigOutput: string | null;
		isWorking: boolean;
		onClose: () => void;
	}>();

	let copyState = $state<'idle' | 'formatted' | 'raw'>('idle');

	function formatHconfigOutput(output: string | null) {
		if (!output) return output ?? '';

		return output
			.split(/\r?\n/)
			.map((line) => {
				const match = line.match(/^((?:\s*(?:PATH|[A-Z_][A-Z0-9_]*_PATH)\s*(?::=|[:=])\s*))(.*)$/i);
				if (!match) return line;

				const value = match[2];
				const separator = value.includes(';') || /^[A-Za-z]:[\\/]/.test(value) ? ';' : ':';
				const paths = value.split(separator);
				return paths.length > 1
					? `${match[1]}\n${paths.map((path) => `    ${path}`).join('\n')}`
					: line;
			})
			.join('\n');
	}

	async function copyHconfigOutput(output: string | null, copyType: 'formatted' | 'raw') {
		if (!output || isWorking) return;
		await navigator.clipboard.writeText(output);
		copyState = copyType;
	}
</script>

<div class="issues-dialog-backdrop">
	<button
		type="button"
		class="issues-dialog-dismiss"
		aria-label="Close hconfig output"
		onclick={onClose}
	></button>
	<dialog open class="issues-dialog hconfig-dialog" aria-labelledby="hconfig-output-title">
		<div class="issues-dialog-header">
			<div>
				<h2 id="hconfig-output-title">hconfig output</h2>
				<p>{installLabel}</p>
			</div>
			<div class="hconfig-dialog-actions">
				<button
					type="button"
					class="dialog-close-button dialog-action-button"
					aria-label={copyState === 'formatted'
						? 'Formatted hconfig output copied'
						: 'Copy formatted hconfig output'}
					data-tooltip={copyState === 'formatted'
						? 'Formatted output copied'
						: 'Copy formatted output'}
					disabled={isWorking || hconfigOutput === null}
					onclick={() => void copyHconfigOutput(formatHconfigOutput(hconfigOutput), 'formatted')}
					onmouseenter={() => (copyState = 'idle')}
				>
					{#if copyState === 'formatted'}
						<Check size={18} strokeWidth={1.8} aria-hidden="true" />
					{:else}
						<Copy size={18} strokeWidth={1.8} aria-hidden="true" />
					{/if}
				</button>
				<button
					type="button"
					class="dialog-close-button dialog-action-button"
					aria-label={copyState === 'raw' ? 'Raw hconfig output copied' : 'Copy raw hconfig output'}
					data-tooltip={copyState === 'raw' ? 'Raw output copied' : 'Copy raw output'}
					disabled={isWorking || hconfigOutput === null}
					onclick={() => void copyHconfigOutput(hconfigOutput, 'raw')}
					onmouseenter={() => (copyState = 'idle')}
				>
					{#if copyState === 'raw'}
						<Check size={18} strokeWidth={1.8} aria-hidden="true" />
					{:else}
						<Copy size={18} strokeWidth={1.8} aria-hidden="true" />
					{/if}
				</button>
				<button
					type="button"
					class="dialog-close-button"
					aria-label="Close hconfig output"
					onclick={onClose}
				>
					<X size={18} strokeWidth={1.8} aria-hidden="true" />
				</button>
			</div>
		</div>
		<pre class="hconfig-output">{formatHconfigOutput(hconfigOutput)}</pre>
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

	.issues-dialog-header p {
		margin: 7px 0 0;
		color: var(--text-muted);
		font-size: 14px;
	}

	.hconfig-dialog-actions {
		display: flex;
		align-items: center;
		gap: 6px;
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

	.dialog-close-button:disabled {
		cursor: default;
		opacity: 0.45;
	}

	.hconfig-output {
		max-height: min(620px, calc(100dvh - 170px));
		margin: 20px 0 0;
		overflow: auto;
		padding: 12px;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: rgba(0, 0, 0, 0.16);
		color: var(--text);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 14px;
		line-height: 1.45;
		white-space: pre-wrap;
		word-break: break-word;
	}
</style>
