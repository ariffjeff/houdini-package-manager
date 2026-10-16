export type PackageExpression<T> = Record<string, T>;

export type PackagePathMethod = 'prepend' | 'append' | 'replace';

export type PackagePathExpression = PackageExpression<string>;

export type PackagePathEntry = string | PackagePathExpression | PackagePathOperation;

export type PackagePathOperation = {
	value: string | PackagePathExpression | PackagePathEntry[];
	method?: PackagePathMethod;
};

export type PackagePathValue = PackagePathEntry | PackagePathEntry[];

export type PackageFolderValue =
	string | string[] | PackagePathExpression | Array<string | PackagePathExpression>;

export type PackageBooleanValue = boolean | string | PackageExpression<boolean>;

export type PackageDependencyValue = string | string[] | PackageExpression<string>;

export type PackageEnvironmentValue = string | number | boolean | PackagePathValue;

export type PackageEnvironmentEntry = Record<string, PackageEnvironmentValue>;

export type PackageEnvironment = Array<string | PackageEnvironmentEntry>;

export type HoudiniPackageConfig = Record<string, unknown> & {
	path?: PackagePathValue;
	hpath?: PackagePathValue;
	env?: PackageEnvironment;
	enable?: PackageBooleanValue;
	load_package_once?: PackageBooleanValue;
	process_order?: number;
	package_path?: PackageFolderValue;
	recommends?: PackageDependencyValue;
	requires?: PackageDependencyValue;
	preload_libraries?: string[];
	show?: boolean;
	/** HPM metadata retained alongside the Houdini package contract. */
	hpm?: Record<string, unknown>;
	/** Legacy HPM package version metadata. */
	version?: string;
};

export type HoudiniPackageConfigKey =
	| 'path'
	| 'hpath'
	| 'env'
	| 'enable'
	| 'load_package_once'
	| 'process_order'
	| 'package_path'
	| 'recommends'
	| 'requires'
	| 'preload_libraries'
	| 'show';

export const houdiniPackageConfigKeys = [
	'path',
	'hpath',
	'env',
	'enable',
	'load_package_once',
	'process_order',
	'package_path',
	'recommends',
	'requires',
	'preload_libraries',
	'show'
] as const satisfies readonly HoudiniPackageConfigKey[];

export const hpmPackageConfigKeys = ['hpm', 'version'] as const;

export const knownPackageConfigKeys = [
	...houdiniPackageConfigKeys,
	'HOUDINI_PATH',
	...hpmPackageConfigKeys
] as const;

export function isHoudiniPackageConfigKey(value: string): value is HoudiniPackageConfigKey {
	return (houdiniPackageConfigKeys as readonly string[]).includes(value);
}

export function clonePackageConfig(config: Record<string, unknown>): Record<string, unknown> {
	return cloneValue(config) as Record<string, unknown>;
}

export function updatePackageConfigValue(
	config: Record<string, unknown>,
	key: HoudiniPackageConfigKey,
	value: unknown
): Record<string, unknown> {
	const nextConfig = clonePackageConfig(config);
	if (value === undefined) delete nextConfig[key];
	else nextConfig[key] = value;
	return nextConfig;
}

function cloneValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(cloneValue);
	if (!value || typeof value !== 'object') return value;
	return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]));
}
