export type PackagePathAlias = 'hpath' | 'HOUDINI_PATH';

export type PackageConfigFixPlan = {
	hpath?: string;
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

	if (plan.migrateLegacyPath !== false) delete packageValue.path;

	if (plan.replacePathAlias) {
		const replacedAlias = oppositePathAlias(plan.replacePathAlias);
		rewritePackageVariableReferences(packageValue, replacedAlias, plan.replacePathAlias);
		removePackageVariable(packageValue, replacedAlias);
	} else if (plan.preservePathAliases) {
		if (shouldWriteHpath) setHpath(packageValue, plan.hpath);
	} else if (plan.keepPathAlias === 'HOUDINI_PATH') {
		removePackageVariable(packageValue, 'hpath');
	} else if (shouldWriteHpath) {
		removePackageVariable(packageValue, 'HOUDINI_PATH');
		setHpath(packageValue, plan.hpath);
	}

	return packageValue;
}

function oppositePathAlias(alias: PackagePathAlias): PackagePathAlias {
	return alias === 'hpath' ? 'HOUDINI_PATH' : 'hpath';
}

function setHpath(packageValue: Record<string, unknown>, hpath: string | undefined): void {
	if (typeof hpath === 'string') packageValue.hpath = hpath.trim();
	else delete packageValue.hpath;
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
