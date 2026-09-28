import type { HoudiniDiscoveryResponse, HoudiniScanStage } from './types';

export type ScanStage = Exclude<HoudiniScanStage, 'all'>;
export type ScanAction = ScanStage | 'all';
export type ScanState = 'pending' | 'loading' | 'ready' | 'error';
export type ScanSource = 'none' | 'saved' | 'live';
export type ScanStatus = {
	state: ScanState;
	error: string;
	source: ScanSource;
	scannedAt: string | null;
};

export const scanStages: Array<{ stage: ScanStage; label: string }> = [
	{ stage: 'installs', label: 'Houdini Installs' },
	{ stage: 'plugins', label: 'Plugins' },
	{ stage: 'git', label: 'Git Metadata' }
];

export const scanStageLabels: Record<ScanStage, string> = {
	installs: 'Houdini Installs',
	plugins: 'Plugins',
	git: 'Git Metadata'
};

export function responseStageTimestamp(response: HoudiniDiscoveryResponse, stage: ScanStage) {
	return (
		response.stageScannedAt?.[stage] ??
		(stage === 'installs' ? response.scannedAt : stage === 'git' ? response.gitSyncedAt : null)
	);
}
