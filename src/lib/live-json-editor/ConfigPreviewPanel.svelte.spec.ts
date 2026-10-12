import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ConfigPreviewPanel from './ConfigPreviewPanel.svelte';

describe('ConfigPreviewPanel.svelte', () => {
	it('shares diff, edit, and raw-original modes', async () => {
		render(ConfigPreviewPanel, {
			originalText: '{\n  "path": "old"\n}',
			previewText: '{\n  "hpath": "new"\n}',
			packagePath: 'package.json',
			editable: true
		});

		const diffToggle = page.getByRole('checkbox', { name: 'Show diff' });
		const rawToggle = page.getByRole('checkbox', { name: 'Show raw original' });

		await expect.element(diffToggle).toBeChecked();
		await expect.element(page.getByText('"hpath": "new"')).toBeInTheDocument();
		await expect
			.element(page.getByRole('textbox', { name: 'Corrected package manifest JSON' }))
			.toBeInTheDocument();

		await diffToggle.click();
		await expect
			.element(page.getByRole('textbox', { name: 'Corrected package manifest JSON' }))
			.toBeInTheDocument();

		await rawToggle.click();
		await expect.element(diffToggle).not.toBeChecked();
		await expect.element(page.getByText('"path": "old"')).toBeInTheDocument();
	});
});
