import { spawn } from 'node:child_process';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { scanHoudiniWorkspace } from './discovery.js';
import { applyPackageConfigFixes } from '../../houdini/package-config-fixes.js';
import type {
	HoudiniInstall,
	HoudiniPluginAction,
	HoudiniPluginActionResponse
} from '../../houdini/types.js';

export async function runPluginAction(
	request: Exclude<HoudiniPluginAction, { action: 'migrate-configs' | 'run-hconfig' }>
): Promise<HoudiniPluginActionResponse> {
	if (request.action === 'open-path') return openInstallPath(request);
	if (!request || typeof request.pluginId !== 'string' || !request.pluginId.trim()) {
		throw new Error('A plugin id is required.');
	}
	if (request.action === 'open-source') {
		if (typeof request.sourcePath !== 'string' || !request.sourcePath.trim()) {
			throw new Error('A source path is required.');
		}
	} else if (typeof request.installId !== 'string' || !request.installId.trim()) {
		throw new Error('An install id is required.');
	}

	const current = await scanHoudiniWorkspace({ stage: 'plugins', pluginIds: [request.pluginId] });
	const plugin = current.plugins.find((candidate) => candidate.id === request.pluginId);
	if (!plugin) throw new Error(`Plugin ${request.pluginId} was not found in the discovery scan.`);

	if (request.action === 'open-source') {
		const source = plugin.sources?.find(
			(candidate) => samePath(candidate.path, request.sourcePath) && candidate.exists
		);
		if (!source) throw new Error(`${plugin.name} has no available source folder at that path.`);
		await openPath(source.path);
		return { message: `Opened ${plugin.name} source folder.` };
	}
	if (request.action === 'open-package-folder') {
		const install = current.installs.find((candidate) => candidate.id === request.installId);
		if (!install) throw new Error(`${plugin.name} was not found for this Houdini install.`);
		const packageRoot = documentsPackageRoot(install);
		if (!packageRoot)
			throw new Error(`${plugin.name} has no Documents package folder for this Houdini install.`);
		await openPath(packageRoot);
		return { message: `Opened ${install.label} package folder.` };
	}
	if (
		request.action !== 'open-config' &&
		request.action !== 'get-config' &&
		request.action !== 'update-config' &&
		request.action !== 'set-enabled'
	) {
		throw new Error('Unknown plugin action.');
	}

	const target = current.targets.find(
		(candidate) =>
			candidate.pluginId === request.pluginId && candidate.installId === request.installId
	);
	if (!target?.packagePath)
		throw new Error(`${plugin.name} has no discovered package config for this Houdini install.`);
	if (request.action === 'get-config') {
		return {
			message: `Loaded ${target.packageFile}.`,
			config: await readPackageValue(target.packagePath),
			packagePath: target.packagePath
		};
	}
	if (request.action === 'update-config') {
		if (
			request.writeHpath !== false &&
			request.keepPathAlias !== 'HOUDINI_PATH' &&
			request.replacePathAlias !== 'HOUDINI_PATH' &&
			!validHpath(request.hpath)
		) {
			throw new Error('A valid local plugin source path is required.');
		}
		if (request.keepPathAlias === 'HOUDINI_PATH') {
			if (target.pathAliasConflict?.hpathUsedAsVariable)
				throw new Error('Replace $hpath references before removing hpath.');
		} else if (
			!request.replacePathAlias &&
			!request.preservePathAliases &&
			target.pathAliasConflict?.houdiniPathUsedAsVariable
		) {
			throw new Error('Replace $HOUDINI_PATH references before removing HOUDINI_PATH.');
		}
		const packageValue = applyPackageConfigFixes(
			await readPackageValue(target.packagePath),
			request
		);
		await writePackageValue(target.packagePath, packageValue);
		return {
			message: `Updated ${target.packageFile}.`,
			discovery: await scanHoudiniWorkspace({ stage: 'plugins', pluginIds: [request.pluginId] })
		};
	}
	if (request.action === 'open-config') {
		await openPath(target.packagePath);
		return { message: `Opened ${target.packageFile}.` };
	}
	await setPackageEnabled(target.packagePath, request.enabled);
	return {
		message: `${plugin.name} ${request.enabled ? 'enabled' : 'disabled'} for the selected Houdini install.`,
		discovery: await scanHoudiniWorkspace({ stage: 'plugins', pluginIds: [request.pluginId] })
	};
}

export async function writableUserPackageDirectory(install: HoudiniInstall): Promise<string> {
	const userRoots = install.packageRoots
		.filter((root) => root.origin === 'user')
		.map((root) => root.path);
	const expectedVersionDirectory = `houdini${install.version}`.toLowerCase();
	const documentsRoot = userRoots.find((root) => {
		const normalizedRoot = path.normalize(root);
		return (
			path.basename(normalizedRoot).toLowerCase() === 'packages' &&
			path.basename(path.dirname(normalizedRoot)).toLowerCase() === expectedVersionDirectory &&
			path.basename(path.dirname(path.dirname(normalizedRoot))).toLowerCase() === 'documents'
		);
	});
	if (documentsRoot) return documentsRoot;
	for (const root of userRoots) if (await isDirectory(root)) return root;
	return userRoots[0] ?? install.packageDirectory;
}

export async function readPackageValue(packagePath: string): Promise<Record<string, unknown>> {
	try {
		const parsed = JSON.parse(await readFile(packagePath, 'utf8')) as unknown;
		if (!isRecord(parsed)) throw new Error('Package JSON root must be an object.');
		return parsed;
	} catch (error) {
		throw new Error(
			`Cannot read ${path.basename(packagePath)}: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error }
		);
	}
}

export async function writePackageValue(
	packagePath: string,
	packageValue: Record<string, unknown>
): Promise<void> {
	await writeFile(packagePath, `${JSON.stringify(packageValue, null, 2)}\n`, 'utf8');
}

export function safePackageFile(packageFile: string): string {
	if (!packageFile || packageFile === '.' || packageFile === '..' || /[\\/:\0]/.test(packageFile))
		throw new Error('A discovered plugin package filename is invalid.');
	return packageFile;
}

async function openInstallPath(
	request: Extract<HoudiniPluginAction, { action: 'open-path' }>
): Promise<HoudiniPluginActionResponse> {
	if (typeof request.installId !== 'string' || !request.installId.trim())
		throw new Error('An install id is required.');
	if (typeof request.path !== 'string' || !request.path.trim())
		throw new Error('A path is required.');
	const current = await scanHoudiniWorkspace({ stage: 'installs' });
	const install = current.installs.find((candidate) => candidate.id === request.installId);
	if (!install) throw new Error('The Houdini install was not found.');
	const allowedPaths = [
		install.hfs,
		install.hconfig,
		install.userPreferences,
		install.packageDirectory,
		...install.packageRoots.map((root) => root.path)
	];
	if (!allowedPaths.some((allowedPath) => samePath(allowedPath, request.path)))
		throw new Error('That path is not associated with the selected Houdini install.');
	const pathToOpen = samePath(install.hconfig, request.path)
		? path.dirname(request.path)
		: request.path;
	await openPath(pathToOpen);
	return { message: `Opened ${path.basename(pathToOpen)}.` };
}

function validHpath(value: string | undefined): value is string {
	return typeof value === 'string' && Boolean(value.trim()) && !/[\0\r\n]/.test(value);
}
function samePath(left: string, right: string): boolean {
	const normalizedLeft = path.normalize(left);
	const normalizedRight = path.normalize(right);
	return process.platform === 'win32'
		? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
		: normalizedLeft === normalizedRight;
}
function documentsPackageRoot(install: HoudiniInstall): string | null {
	const expectedVersionDirectory = `houdini${install.version}`.toLowerCase();
	return (
		install.packageRoots.find(({ path: root, origin }) => {
			const normalizedRoot = path.normalize(root);
			return (
				origin === 'user' &&
				path.basename(normalizedRoot).toLowerCase() === 'packages' &&
				path.basename(path.dirname(normalizedRoot)).toLowerCase() === expectedVersionDirectory &&
				path.basename(path.dirname(path.dirname(normalizedRoot))).toLowerCase() === 'documents'
			);
		})?.path ?? null
	);
}
async function setPackageEnabled(packagePath: string, enabled: boolean): Promise<void> {
	const packageValue = await readPackageValue(packagePath);
	packageValue.enable = enabled;
	await writePackageValue(packagePath, packageValue);
}
async function openPath(target: string): Promise<void> {
	let targetStats;
	try {
		targetStats = await stat(target);
	} catch (error) {
		throw new Error(
			`Cannot open ${target}: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error }
		);
	}
	const command =
		process.platform === 'win32' ? 'cmd.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
	const normalizedTarget = path.normalize(target);
	const args =
		process.platform === 'win32'
			? targetStats.isDirectory()
				? ['/d', '/c', 'start', '', '/b', 'explorer.exe', normalizedTarget]
				: ['/d', '/c', 'start', '', '/b', normalizedTarget]
			: [normalizedTarget];
	const child = spawn(command, args, { stdio: 'ignore', windowsHide: true });
	child.unref?.();
}
async function isDirectory(filePath: string): Promise<boolean> {
	try {
		return (await stat(filePath)).isDirectory();
	} catch {
		return false;
	}
}
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
