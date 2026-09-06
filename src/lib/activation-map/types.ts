import type { Edge, Node } from '@xyflow/svelte';

export type ActivationNodeKind = 'plugin' | 'install';

export type ActivationStatus = 'enabled' | 'disabled' | 'warning' | 'incompatible' | 'missing';

export type PluginRecord = {
	id: string;
	name: string;
	description: string;
	version: string;
	license: string;
	source: string;
	tags: string[];
};

export type HoudiniInstall = {
	id: string;
	label: string;
	version: string;
	build: string;
	platform: string;
	architecture: string;
	role: string;
	userPreferences: string;
	packageCount: number;
};

export type ActivationTarget = {
	pluginId: string;
	installId: string;
	status: ActivationStatus;
	artifactVersion: string | null;
	packageFile: string;
	note: string;
};

export type ActivationNodeData = {
	kind: ActivationNodeKind;
	eyebrow: string;
	label: string;
	meta: string;
	status: ActivationStatus;
	statusLabel: string;
	accent: string;
};

export type ActivationEdgeData = {
	pluginId: string;
	installId: string;
	status: ActivationStatus;
	artifactVersion: string | null;
};

export type ActivationNode = Node<ActivationNodeData, ActivationNodeKind>;
export type ActivationEdge = Edge<ActivationEdgeData>;

export const activationStatusLabels: Record<ActivationStatus, string> = {
	enabled: 'Enabled',
	disabled: 'Disabled',
	warning: 'Review',
	incompatible: 'Incompatible',
	missing: 'Missing'
};
