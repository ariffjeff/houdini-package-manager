import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { scanHoudiniWorkspace } from './discovery.js';
export { expandWindowsShortPaths } from './hconfig-paths.js';
import { expandWindowsShortPaths } from './hconfig-paths.js';
import type { HoudiniPluginActionResponse, HoudiniPluginAction } from '../../houdini/types.js';

const execFileAsync = promisify(execFile);

export async function runHconfig(
	request: Extract<HoudiniPluginAction, { action: 'run-hconfig' }>,
	signal?: AbortSignal
): Promise<HoudiniPluginActionResponse> {
	if (typeof request.installId !== 'string' || !request.installId.trim()) {
		throw new Error('An install id is required.');
	}

	const current = await scanHoudiniWorkspace({ stage: 'installs' });
	const install = current.installs.find((candidate) => candidate.id === request.installId);
	if (!install) throw new Error('The Houdini install was not found.');

	try {
		const result = await execFileAsync(install.hconfig, [], {
			cwd: install.hfs,
			env: { ...process.env, HFS: install.hfs },
			encoding: 'utf8',
			maxBuffer: 1024 * 1024,
			timeout: 10_000,
			windowsHide: true,
			signal
		});
		return formatHconfigResponse(
			install.label,
			[result.stdout, result.stderr].filter(Boolean).join('\n'),
			request
		);
	} catch (error) {
		const commandError = error as Error & { stderr?: string; stdout?: string };
		const output = [commandError.stdout, commandError.stderr].filter(Boolean).join('\n');
		return formatHconfigResponse(install.label, output || commandError.message, request, true);
	}
}

async function formatHconfigResponse(
	label: string,
	rawOutput: string,
	request: Extract<HoudiniPluginAction, { action: 'run-hconfig' }>,
	failed = false
): Promise<HoudiniPluginActionResponse> {
	const expandedOutput =
		request.expandShortPaths === false || process.platform !== 'win32'
			? undefined
			: await expandWindowsShortPaths(rawOutput);
	return {
		message: `${failed ? 'hconfig failed' : 'Ran hconfig'} for ${label}.`,
		output: rawOutput,
		rawOutput,
		expandedOutput
	};
}
