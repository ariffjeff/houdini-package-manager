import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HoudiniDiscoveryResponse, InstallPluginResponse } from '$lib/houdini/types';
import { installHoudiniPlugin } from '$lib/houdini/client';
import type { InstallDialogOptions, InstallDialogPlugin, InstallDialogSelection } from './types';
import { runPluginInstall, type InstallWorkflowCallbacks } from './install-workflow';

vi.mock('$lib/houdini/client', () => ({
	installHoudiniPlugin: vi.fn(),
	runHoudiniPluginAction: vi.fn()
}));

const mockedInstall = vi.mocked(installHoudiniPlugin);
const discovery = {} as HoudiniDiscoveryResponse;
const response: InstallPluginResponse = { message: 'Installed Demo.', discovery };
const plugin: InstallDialogPlugin = { id: 'plugin:demo', name: 'Demo' };
const selection: InstallDialogSelection = {
	packageFile: 'Demo.json',
	version: 'v1.2.3',
	installIds: ['install:21.0'],
	destinationPath: 'C:/HPM/plugins/demo',
	includeHpmMetadata: true,
	generatedConfigText: '{"hpath":"C:/HPM/plugins/demo"}'
};
const options: InstallDialogOptions = {
	openInstalledFolder: false,
	openInstalledConfig: false
};

function createCallbacks(): InstallWorkflowCallbacks {
	return {
		applyDiscovery: vi.fn(),
		setState: vi.fn(),
		setMessage: vi.fn(),
		setController: vi.fn(),
		recordActivity: vi.fn(),
		getErrorMessage: (error) => (error instanceof Error ? error.message : String(error))
	};
}

describe('runPluginInstall', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('uses the discovered plugin identity and records a successful install', async () => {
		mockedInstall.mockResolvedValue(response);
		const callbacks = createCallbacks();

		await runPluginInstall(plugin, selection, options, [], callbacks);

		expect(mockedInstall).toHaveBeenCalledWith(
			expect.objectContaining({ pluginId: plugin.id, version: selection.version }),
			expect.any(AbortSignal)
		);
		expect(callbacks.applyDiscovery).toHaveBeenCalledWith(discovery);
		expect(callbacks.setState).toHaveBeenNthCalledWith(1, 'working');
		expect(callbacks.setState).toHaveBeenNthCalledWith(2, 'success');
		expect(callbacks.setMessage).toHaveBeenLastCalledWith(response.message);
		expect(callbacks.recordActivity).toHaveBeenCalledWith(
			expect.objectContaining({ status: 'success', title: 'Installed Demo' })
		);
	});

	it('supports repository installs and route-specific completion hooks', async () => {
		mockedInstall.mockResolvedValue(response);
		const callbacks = createCallbacks();
		callbacks.postInstallActions = vi.fn().mockResolvedValue(['Opened destination.']);
		callbacks.onSuccess = vi.fn();

		await runPluginInstall(plugin, selection, options, [], callbacks, {
			repositoryUrl: 'https://github.com/example/demo',
			packageFile: selection.packageFile
		});

		expect(mockedInstall).toHaveBeenCalledWith(
			expect.objectContaining({
				repositoryUrl: 'https://github.com/example/demo',
				packageFile: selection.packageFile
			}),
			expect.any(AbortSignal)
		);
		expect(callbacks.postInstallActions).toHaveBeenCalledWith(
			expect.objectContaining({ repositoryUrl: 'https://github.com/example/demo' }),
			options,
			discovery
		);
		expect(callbacks.setMessage).toHaveBeenLastCalledWith('Installed Demo. Opened destination.');
		expect(callbacks.onSuccess).toHaveBeenCalledWith('Installed Demo. Opened destination.');
	});

	it('returns to idle and clears its controller when cancelled', async () => {
		mockedInstall.mockRejectedValue(new DOMException('Cancelled.', 'AbortError'));
		const callbacks = createCallbacks();
		callbacks.setController = vi.fn((controller) => controller?.abort());

		await runPluginInstall(plugin, selection, options, [], callbacks);

		expect(callbacks.setState).toHaveBeenNthCalledWith(1, 'working');
		expect(callbacks.setState).toHaveBeenNthCalledWith(2, 'idle');
		expect(callbacks.setMessage).toHaveBeenLastCalledWith('Installation cancelled.');
		expect(callbacks.setController).toHaveBeenLastCalledWith(null);
		expect(callbacks.recordActivity).toHaveBeenCalledWith(
			expect.objectContaining({ status: 'cancelled' })
		);
	});
});
