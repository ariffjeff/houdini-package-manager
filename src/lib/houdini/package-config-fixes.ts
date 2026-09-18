export type PackagePathAlias = 'hpath' | 'HOUDINI_PATH';

export type PackageConfigFixPlan = {
	hpath?: string;
	pathAlias?: PackagePathAlias;
	writeHpath?: boolean;
	migrateLegacyPath?: boolean;
	preservePathAliases?: boolean;
	keepPathAlias?: PackagePathAlias;
	replacePathAlias?: PackagePathAlias;
};

export function applyPackageConfigFixes(
	config: Record<string, unknown>,
	plan: PackageConfigFixPlan
): Record<string, unknown> {
	const packageValue = cloneJsonRecord(config);
	const shouldWriteHpath = plan.writeHpath !== false;
	const targetAlias = plan.pathAlias ?? 'hpath';

	if (plan.migrateLegacyPath !== false) delete packageValue.path;

	if (plan.replacePathAlias) {
		const replacedAlias = oppositePathAlias(plan.replacePathAlias);
		rewritePackageVariableReferences(packageValue, replacedAlias, plan.replacePathAlias);
		removePackageVariable(packageValue, replacedAlias);
		if (shouldWriteHpath) setPathAlias(packageValue, plan.replacePathAlias, plan.hpath);
	} else if (plan.preservePathAliases) {
		if (shouldWriteHpath) setPathAlias(packageValue, targetAlias, plan.hpath);
	} else if (plan.keepPathAlias) {
		removePackageVariable(packageValue, oppositePathAlias(plan.keepPathAlias));
		if (shouldWriteHpath) setPathAlias(packageValue, plan.keepPathAlias, plan.hpath);
	} else if (shouldWriteHpath) {
		removePackageVariable(packageValue, oppositePathAlias(targetAlias));
		setPathAlias(packageValue, targetAlias, plan.hpath);
	}

	return packageValue;
}

function oppositePathAlias(alias: PackagePathAlias): PackagePathAlias {
	return alias === 'hpath' ? 'HOUDINI_PATH' : 'hpath';
}

function setPathAlias(
	packageValue: Record<string, unknown>,
	alias: PackagePathAlias,
	hpath: string | undefined
): void {
	const value = typeof hpath === 'string' ? hpath.trim() : findJsonString(packageValue, alias);
	if (!value) return;
	removeJsonKey(packageValue, alias);
	if (alias === 'HOUDINI_PATH') {
		const env = Array.isArray(packageValue.env) ? packageValue.env.filter(isRecord) : [];
		if (!env.length) env.push({});
		env[0][alias] = value;
		packageValue.env = env;
	} else {
		packageValue[alias] = value;
	}
}

function findJsonString(value: unknown, key: string): string | undefined {
	if (Array.isArray(value)) {
		for (const entry of value) {
			const found = findJsonString(entry, key);
			if (found !== undefined) return found;
		}
		return undefined;
	}
	if (!isRecord(value)) return undefined;
	if (typeof value[key] === 'string') return value[key];
	for (const entry of Object.values(value)) {
		const found = findJsonString(entry, key);
		if (found !== undefined) return found;
	}
	return undefined;
}

function removePackageVariable(packageValue: Record<string, unknown>, key: string): void {
	removeJsonKey(packageValue, key);
	if (Array.isArray(packageValue.env)) {
		packageValue.env = packageValue.env.filter(
			(entry) => !isRecord(entry) || Object.keys(entry).length > 0
		);
	}
}

function rewritePackageVariableReferences(
	packageValue: Record<string, unknown>,
	from: PackagePathAlias,
	to: PackagePathAlias
): void {
	const reference = new RegExp(`\\$${from}(?![A-Za-z0-9_])`, 'g');
	rewriteJsonStrings(packageValue, reference, `$${to}`);
}

function rewriteJsonStrings(value: unknown, pattern: RegExp, replacement: string): void {
	if (Array.isArray(value)) {
		for (let index = 0; index < value.length; index += 1) {
			if (typeof value[index] === 'string')
				value[index] = value[index].replace(pattern, replacement);
			else rewriteJsonStrings(value[index], pattern, replacement);
		}
		return;
	}
	if (!isRecord(value)) return;
	for (const [key, entry] of Object.entries(value)) {
		if (typeof entry === 'string') value[key] = entry.replace(pattern, replacement);
		else rewriteJsonStrings(entry, pattern, replacement);
	}
}

function removeJsonKey(value: unknown, key: string): void {
	if (Array.isArray(value)) {
		for (const entry of value) removeJsonKey(entry, key);
		return;
	}
	if (!isRecord(value)) return;

	delete value[key];
	for (const entry of Object.values(value)) removeJsonKey(entry, key);
}

function cloneJsonRecord(value: Record<string, unknown>): Record<string, unknown> {
	return cloneJsonValue(value) as Record<string, unknown>;
}

function cloneJsonValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map((entry) => cloneJsonValue(entry));
	if (!isRecord(value)) return value;
	return Object.fromEntries(
		Object.entries(value).map(([key, entry]) => [key, cloneJsonValue(entry)])
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
