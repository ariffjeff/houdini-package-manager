import { execFile } from 'node:child_process';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const commandTimeout = 120_000;

export type InstalledProvenance = {
	commit: string;
	manifestBlobSha: string;
	verifiedCommit: boolean;
	verifiedManifest: boolean;
	verified: boolean;
	approvedCommit?: string;
	approvedManifestBlobSha?: string;
	hasCuratedProvenance: boolean;
};

export async function ensureGitCheckout(
	repositoryUrl: string,
	version: string,
	destination: string,
	signal?: AbortSignal,
	pinnedCommit?: string,
	manifestBlobSha?: string,
	packageFile?: string
): Promise<InstalledProvenance> {
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
				['clone', '--no-checkout', '--no-recurse-submodules', repositoryUrl, destination],
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
	const checkedOutCommit = await runGitRequired(destination, ['rev-parse', 'HEAD'], signal);
	if (!packageFile) throw new Error('The installed plugin package file is required.');
	const manifestCommitPath = `HEAD:${packageFile.replaceAll('\\', '/')}`;
	const checkedOutManifest = await runGitRequired(
		destination,
		['rev-parse', manifestCommitPath],
		signal
	);
	const verifiedCommit = Boolean(
		pinnedCommit && checkedOutCommit.toLowerCase() === pinnedCommit.toLowerCase()
	);
	const verifiedManifest = Boolean(
		manifestBlobSha && checkedOutManifest.toLowerCase() === manifestBlobSha.toLowerCase()
	);
	const hasCuratedProvenance = Boolean(pinnedCommit || manifestBlobSha);
	return {
		commit: checkedOutCommit,
		manifestBlobSha: checkedOutManifest,
		verifiedCommit,
		verifiedManifest,
		verified: hasCuratedProvenance && verifiedCommit && verifiedManifest,
		...(pinnedCommit ? { approvedCommit: pinnedCommit } : {}),
		...(manifestBlobSha ? { approvedManifestBlobSha: manifestBlobSha } : {}),
		hasCuratedProvenance
	};
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
