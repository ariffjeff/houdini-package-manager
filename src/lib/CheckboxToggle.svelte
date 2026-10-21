<script lang="ts">
	type Props = {
		checked: boolean;
		disabled?: boolean;
		ariaLabel: string;
		onChange: (checked: boolean) => void;
	};

	let { checked, disabled = false, ariaLabel, onChange }: Props = $props();
</script>

<label class="checkbox-toggle">
	<input
		class="checkbox-toggle-input"
		type="checkbox"
		{checked}
		{disabled}
		aria-label={ariaLabel}
		onchange={(event) => onChange(event.currentTarget.checked)}
	/>
	<span class="checkbox-toggle-box" aria-hidden="true"></span>
</label>

<style>
	.checkbox-toggle {
		position: relative;
		display: block;
		grid-column: 1;
		grid-row: 1 / span 2;
		align-self: stretch;
		width: 30px;
		min-height: 0;
		box-sizing: border-box;
		padding: 0;
		cursor: pointer;
	}

	.checkbox-toggle-input {
		position: absolute;
		inset: 8px 0;
		z-index: 1;
		width: 100%;
		height: auto;
		margin: 0;
		cursor: pointer;
		opacity: 0;
	}

	.checkbox-toggle-input:disabled {
		cursor: not-allowed;
	}

	.checkbox-toggle-box {
		position: absolute;
		top: 8px;
		bottom: 8px;
		left: 4px;
		width: 22px;
		box-sizing: border-box;
		border: 1px solid var(--line-strong);
		border-radius: 4px;
		background: rgba(8, 14, 16, 0.5);
		transition:
			background 140ms ease,
			border-color 140ms ease;
	}

	.checkbox-toggle-box::after {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 6px;
		height: 11px;
		border: solid #f2fff9;
		border-width: 0 2px 2px 0;
		content: '';
		opacity: 0;
		transform: translate(-50%, -58%) rotate(45deg);
		transition: opacity 140ms ease;
	}

	.checkbox-toggle:has(.checkbox-toggle-input:checked) .checkbox-toggle-box {
		border-color: #3d9b7c;
		background: #2e8065;
	}

	.checkbox-toggle:has(.checkbox-toggle-input:checked) .checkbox-toggle-box::after {
		opacity: 1;
	}

	.checkbox-toggle:has(.checkbox-toggle-input:focus-visible) {
		outline: 3px solid rgba(59, 155, 130, 0.26);
		outline-offset: 1px;
	}
</style>
