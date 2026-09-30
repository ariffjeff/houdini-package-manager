import { realpath } from 'node:fs/promises';

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
