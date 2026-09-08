import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { discoverHoudiniWorkspace } from './discovery.js';
import type {
	HoudiniInstall,
	InstallPluginRequest,
	InstallPluginResponse,
	PluginRecord
} from '../../houdini/types.js';

const execFileAsync = promisify(execFile);
const commandTimeout = 120_000;

export async function installHoudiniPlugin(
	request: InstallPluginRequest,
	signal?: AbortSignal
): Promise<InstallPluginResponse> {
	validateInstallPluginRequest(request);
	throwIfAborted(signal);

	const current = await discoverHoudiniWorkspace();
	const plugin = current.plugins.find((candidate) => candidate.id === request.pluginId);
	if (!plugin) throw new Error(`Plugin ${request.pluginId} was not found in the discovery scan.`);
	if (!plugin.repositoryUrl) {
		throw new Error(`${plugin.name} does not have a discoverable Git repository.`);
	}
	if (!(plugin.availableVersions ?? []).includes(request.version)) {
		throw new Error(`${request.version} is not an available Git tag for ${plugin.name}.`);
	}

	const installs = selectInstalls(current.installs, request);
	if (!installs.length) throw new Error('No Houdini install matched the requested scope.');

	const pluginSlug = slugify(plugin);
	const repositoryPath = await managedRepositoryPath(pluginSlug, request, installs[0]);
	await ensureGitCheckout(plugin.repositoryUrl, request.version, repositoryPath, signal);

	for (const install of installs) {
		throwIfAborted(signal);
		const packageDirectory = await writableUserPackageDirectory(install);
		await mkdir(packageDirectory, { recursive: true });
		const existingTarget = current.targets.find(
			(target) =>
				target.pluginId === plugin.id &&
				target.installId === install.id &&
				target.packagePath &&
				path.normalize(path.dirname(target.packagePath)) === path.normalize(packageDirectory)
		);
		const packagePath =
			existingTarget?.packagePath ?? path.join(packageDirectory, plugin.packageFile);
		await writeManagedPackage(packagePath, plugin, request.version, repositoryPath, signal);
	}

	throwIfAborted(signal);
	const discovery = await discoverHoudiniWorkspace();
	const targetLabel =
		request.scope === 'global' ? 'all detected Houdini installs' : installs[0].label;
	return {
		message: `${plugin.name} ${request.version} installed for ${targetLabel}.`,
		discovery
	};
}

export function validateInstallPluginRequest(request: InstallPluginRequest): void {
	if (!request || typeof request !== 'object') {
		throw new Error('Install request must be an object.');
	}
	if (typeof request.pluginId !== 'string' || !request.pluginId.trim()) {
		throw new Error('A plugin id is required.');
	}
	if (
		typeof request.version !== 'string' ||
		!request.version.trim() ||
		/[\0\r\n]/.test(request.version) ||
		request.version.startsWith('-')
	) {
		throw new Error('A valid plugin version tag is required.');
	}
	if (request.scope !== 'global' && request.scope !== 'install') {
		throw new Error('Install scope must be global or install.');
	}
	if (
		request.installId !== undefined &&
		(typeof request.installId !== 'string' || !request.installId.trim())
	) {
		throw new Error('Install id must be a non-empty string when provided.');
	}
	if (request.scope === 'install' && !request.installId?.trim()) {
		throw new Error('An install id is required for install-scoped requests.');
	}
}

function selectInstalls(
	installs: HoudiniInstall[],
	request: InstallPluginRequest
): HoudiniInstall[] {
	if (request.scope === 'global') return installs;
	if (!request.installId) return [];
	return installs.filter((install) => install.id === request.installId);
}

async function managedRepositoryPath(
	pluginSlug: string,
	request: InstallPluginRequest,
	install: HoudiniInstall
): Promise<string> {
	if (request.scope === 'global') {
		return path.join(os.homedir(), 'Documents', 'HPM', 'plugins', pluginSlug);
	}

	const packageDirectory = await writableUserPackageDirectory(install);
	return path.join(path.dirname(packageDirectory), 'hpm', 'plugins', pluginSlug);
}

async function writableUserPackageDirectory(install: HoudiniInstall): Promise<string> {
	const userRoots = install.packageRoots
		.filter((root) => root.origin === 'user')
		.map((root) => root.path);

	for (const root of userRoots) {
		if (await isDirectory(root)) return root;
	}

	return (
		userRoots.find((root) => root.toLowerCase().includes(`${path.sep}documents${path.sep}`)) ??
		userRoots[0] ??
		install.packageDirectory
	);
}

async function ensureGitCheckout(
	repositoryUrl: string,
	version: string,
	destination: string,
	signal?: AbortSignal
): Promise<void> {
	throwIfAborted(signal);
	const destinationExists = await isDirectory(destination);
	if (destinationExists) {
		if (await runGit(destination, ['rev-parse', '--is-inside-work-tree'])) {
			await runGitRequired(destination, ['fetch', '--tags', '--prune', 'origin'], signal);
		} else if (await hasEntries(destination)) {
			throw new Error(`Managed plugin directory is not a Git checkout: ${destination}`);
		} else {
			await rm(destination, { recursive: true, force: true });
		}
	}

	if (!destinationExists) {
		throwIfAborted(signal);
		await mkdir(path.dirname(destination), { recursive: true });
		try {
			await runGitRequired(
				undefined,
				['clone', '--no-checkout', repositoryUrl, destination],
				signal
			);
		} catch (error) {
			if (signal?.aborted) {
				await rm(destination, { recursive: true, force: true });
			}
			throw error;
		}
	}

	await runGitRequired(destination, ['checkout', '--detach', version], signal);
}

async function writeManagedPackage(
	packagePath: string,
	plugin: PluginRecord,
	version: string,
	repositoryPath: string,
	signal?: AbortSignal
): Promise<void> {
	throwIfAborted(signal);
	let packageValue: Record<string, unknown> = {};
	try {
		const existing = JSON.parse(await readFile(packagePath, 'utf8')) as unknown;
		if (isRecord(existing)) packageValue = existing;
	} catch (error) {
		if (await fileExists(packagePath)) {
			throw new Error(
				`Cannot update ${plugin.packageFile}: ${error instanceof Error ? error.message : String(error)}`,
				{ cause: error }
			);
		}
	}

	packageValue.path = repositoryPath;
	packageValue.enable = true;
	packageValue.hpm = {
		managed: true,
		repository: plugin.repositoryUrl,
		version
	};
	await writeFile(packagePath, `${JSON.stringify(packageValue, null, 2)}\n`, 'utf8');
}

async function runGit(cwd: string | undefined, args: string[]): Promise<string> {
	try {
		const result = await execFileAsync('git', args, {
			cwd,
			encoding: 'utf8',
			maxBuffer: 1024 * 1024,
			timeout: commandTimeout,
			windowsHide: true
		});
		return result.stdout.trim();
	} catch {
		return '';
	}
}

async function runGitRequired(
	cwd: string | undefined,
	args: string[],
	signal?: AbortSignal
): Promise<string> {
	try {
		const result = await execFileAsync('git', args, {
			cwd,
			encoding: 'utf8',
			maxBuffer: 1024 * 1024,
			timeout: commandTimeout,
			windowsHide: true,
			signal
		});
		return result.stdout.trim();
	} catch (error) {
		const commandError = error as Error & { stderr?: string };
		throw new Error(commandError.stderr?.trim() || commandError.message, { cause: error });
	}
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) {
		throw new DOMException('Plugin installation was cancelled.', 'AbortError');
	}
}

function slugify(plugin: PluginRecord): string {
	return plugin.id
		.replace(/^package:/, '')
		.replace(/[^a-z0-9]+/gi, '-')
		.toLowerCase();
}

async function hasEntries(directory: string): Promise<boolean> {
	try {
		return (await readdir(directory)).length > 0;
	} catch {
		return false;
	}
}

async function isDirectory(filePath: string): Promise<boolean> {
	try {
		return (await stat(filePath)).isDirectory();
	} catch {
		return false;
	}
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		return (await stat(filePath)).isFile();
	} catch {
		return false;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
