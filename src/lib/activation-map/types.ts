import type { Edge, Node } from '@xyflow/svelte';
import type { PackageOrigin } from '../houdini/types';

export type {
	HoudiniDiscoveryDiagnostic,
	HoudiniDiscoveryResponse,
	HoudiniInstall,
	HoudiniPlatform,
	InstallHealth,
	PackageOrigin,
	PluginRecord
} from '../houdini/types';

export type ActivationNodeKind = 'plugin' | 'official' | 'install';

export type ActivationStatus = 'enabled' | 'disabled' | 'warning' | 'incompatible' | 'missing';

export type ActivationTarget = {
	pluginId: string;
	installId: string;
	status: ActivationStatus;
	artifactVersion: string | null;
	packageFile: string;
	packagePath: string | null;
	origin: PackageOrigin | null;
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
	hasGitRepository?: boolean;
	gitSyncedAt?: string | null;
	searchText?: string;
	pluginIds?: string[];
};

export type ActivationEdgeData = {
	pluginId: string;
	pluginIds: string[];
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
