import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { promisify } from 'node:util';
import { scanHoudiniWorkspace } from './discovery.js';
import type { HoudiniPluginActionResponse, HoudiniPluginAction } from '../../houdini/types.js';

const execFileAsync = promisify(execFile);

type PathResolver = (path: string) => Promise<string>;

function looksLikePath(value: string) {
	return /^(?:[A-Za-z]:[\\/]|[\\/]|~[\\/])/.test(value) || value.includes('\\');
}

function preservePathSeparators(expanded: string, original: string) {
	return original.includes('/') && !original.includes('\\')
		? expanded.replaceAll('\\', '/')
		: expanded;
}

async function expandPathSegment(value: string, resolvePath: PathResolver) {
	const trimmed = value.trim();
	const quote =
		trimmed[0] === trimmed.at(-1) && (trimmed[0] === "'" || trimmed[0] === '"') ? trimmed[0] : '';
	const pathValue = quote ? trimmed.slice(1, -1) : trimmed;
	if (!pathValue || pathValue === '&' || pathValue === '@' || !looksLikePath(pathValue))
		return value;

	try {
		const expanded = preservePathSeparators(await resolvePath(pathValue), pathValue);
		const leadingWhitespace = value.slice(0, value.indexOf(trimmed));
		const trailingWhitespace = value.slice(value.indexOf(trimmed) + trimmed.length);
		return `${leadingWhitespace}${quote}${expanded}${quote}${trailingWhitespace}`;
	} catch {
		return value;
	}
}

export async function expandWindowsShortPaths(
	output: string,
	resolvePath: PathResolver = realpath
): Promise<string> {
	const lines = await Promise.all(
		output.split(/(\r?\n)/).map(async (line) => {
			if (/^\r?\n$/.test(line)) return line;
			const match = line.match(/^(\s*[A-Za-z_][A-Za-z0-9_]*\s*(?::=|=)\s*)(.*?)(\s*)$/);
			if (!match) return line;

			const separator = match[2].includes(';') ? ';' : null;
			if (!separator) {
				return `${match[1]}${await expandPathSegment(match[2], resolvePath)}${match[3]}`;
			}

			const expanded = await Promise.all(
				match[2].split(separator).map((segment) => expandPathSegment(segment, resolvePath))
			);
			return `${match[1]}${expanded.join(separator)}${match[3]}`;
		})
	);

	return lines.join('');
}

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
