import { configHpath, evaluateConfigVariables } from '$lib/live-json-editor/config-editor';

export function configuredPluginDestination(
	manifestText: string,
	variables: Record<string, string>,
	fallback: string
): string {
	const evaluatedText = evaluateConfigVariables(manifestText, variables);
	try {
		const parsed = JSON.parse(evaluatedText) as unknown;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
		const configuredDestination = configHpath(parsed as Record<string, unknown>, '');
		return configuredDestination && !configuredDestination.includes('$')
			? configuredDestination
			: fallback;
	} catch {
		return fallback;
	}
}
