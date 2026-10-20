import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PackageConfigControls from './PackageConfigControls.svelte';

describe('PackageConfigControls.svelte', () => {
	it('updates known values while preserving unknown keys', async () => {
		let nextConfig: Record<string, unknown> | undefined;

		render(PackageConfigControls, {
			config: {
				enable: false,
				env: [{ TOOL_ROOT: '$HOME/tool' }],
				custom_setting: { keep: true }
			},
			onChange: (config: Record<string, unknown>) => (nextConfig = config)
		});

		await page.getByRole('checkbox', { name: 'Enable package' }).click();

		await expect.element(page.getByText('custom_setting')).toBeInTheDocument();
		expect(nextConfig).toEqual({
			enable: true,
			env: [{ TOOL_ROOT: '$HOME/tool' }],
			custom_setting: { keep: true }
		});
	});

	it('disables a keyword while preserving its card state', async () => {
		let changeCount = 0;

		render(PackageConfigControls, {
			config: {},
			onChange: () => changeCount++
		});

		const keyword = page.getByRole('button', {
			name: 'enable: Controls whether Houdini loads this package.'
		});
		await keyword.click();

		await expect.element(keyword).toHaveAttribute('aria-pressed', 'true');
		await expect.element(keyword).toHaveClass('is-active');
		expect(changeCount).toBe(1);

		await page.getByRole('checkbox', { name: 'Enable package' }).click();
		await keyword.click();

		await expect.element(keyword).toHaveAttribute('aria-pressed', 'false');
		await expect.element(keyword).not.toHaveClass('is-active');
		await expect.element(page.getByText('Enable package', { exact: true })).not.toBeInTheDocument();

		await keyword.click();
		await expect.element(keyword).toHaveAttribute('aria-pressed', 'true');
		await expect
			.element(page.getByRole('checkbox', { name: 'Enable package' }))
			.toBeInTheDocument();
		expect(changeCount).toBe(4);
	});

	it('updates advanced environment values with array shapes', async () => {
		let nextConfig: Record<string, unknown> | undefined;

		render(PackageConfigControls, {
			config: {
				env: [
					{
						TOOL_ROOT: [{ "houdini_os == 'windows'": '$HOME/tool' }]
					}
				]
			},
			onChange: (config: Record<string, unknown>) => (nextConfig = config)
		});

		const editor = page.getByRole('textbox', { name: 'Advanced JSON value' });
		const nextValue = '[{"houdini_os == \'linux\'":"$HOME/linux"}]';
		await editor.fill(nextValue);

		expect(nextConfig).toEqual({
			env: [{ TOOL_ROOT: [{ "houdini_os == 'linux'": '$HOME/linux' }] }]
		});
	});

	it('updates keyword values and environment names while typing', async () => {
		let nextConfig: Record<string, unknown> | undefined;

		render(PackageConfigControls, {
			config: {
				requires: 'houdini',
				env: [{ TOOL_ROOT: '$HOME/tool', EXTRA: 'value' }]
			},
			onChange: (config: Record<string, unknown>) => (nextConfig = config)
		});

		await expect
			.element(page.getByRole('table', { name: 'Environment variables' }))
			.toBeInTheDocument();
		await page.getByRole('textbox', { name: 'Value 1' }).fill('houdini-core');
		expect(nextConfig).toEqual({
			requires: 'houdini-core',
			env: [{ TOOL_ROOT: '$HOME/tool', EXTRA: 'value' }]
		});

		await page.getByRole('textbox', { name: 'Variable name' }).first().fill('TOOL_BASE');
		expect(nextConfig).toEqual({
			requires: 'houdini-core',
			env: [{ TOOL_BASE: '$HOME/tool', EXTRA: 'value' }]
		});

		await page.getByRole('button', { name: 'Remove environment variable TOOL_BASE' }).click();
		expect(nextConfig).toEqual({
			requires: 'houdini-core',
			env: [{ EXTRA: 'value' }]
		});

		await page.getByRole('button', { name: 'Add variable' }).click();
		expect(nextConfig).toEqual({
			requires: 'houdini-core',
			env: [{ EXTRA: 'value' }, { NEW_VARIABLE: '' }]
		});
	});
});
