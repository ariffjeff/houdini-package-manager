import { scanHoudiniWorkspace } from './client';
import type { HoudiniDiscoveryResponse } from './types';
import type { ScanAction, ScanStage, ScanState } from './scan';

type ScanOrchestratorOptions = {
	stages: readonly ScanStage[];
	getActiveScan: () => ScanAction | null;
	setActiveScan: (scan: ScanAction | null) => void;
	getInitialScanStarted: () => boolean;
	setInitialScanStarted: (started: boolean) => void;
	setScanStatus: (stage: ScanStage, state: ScanState, error?: string) => void;
	applyDiscovery: (response: HoudiniDiscoveryResponse, liveStage?: ScanAction) => void;
	reconcileSelectedNode: (response: HoudiniDiscoveryResponse) => void;
	recordScanActivity: (
		stage: ScanStage,
		status: 'success' | 'error',
		pluginIds?: string[],
		message?: string
	) => void;
	getErrorMessage: (error: unknown) => string;
};

export function createScanOrchestrator(options: ScanOrchestratorOptions) {
	async function performScanStage(stage: ScanStage, pluginIds: string[] = []) {
		options.setScanStatus(stage, 'loading');
		const response = await scanHoudiniWorkspace({
			stage,
			...(pluginIds.length ? { pluginIds: [...pluginIds] } : {})
		});
		options.applyDiscovery(response, stage);
		options.setScanStatus(stage, 'ready');
		return response;
	}

	async function runStage(stage: ScanStage, pluginIds: string[] = []): Promise<boolean> {
		if (options.getActiveScan() !== null) return false;

		options.setActiveScan(stage);
		try {
			const response = await performScanStage(stage, pluginIds);
			options.reconcileSelectedNode(response);
			options.recordScanActivity(stage, 'success', pluginIds);
			return true;
		} catch (error) {
			const message = options.getErrorMessage(error);
			options.setScanStatus(stage, 'error', message);
			options.recordScanActivity(stage, 'error', pluginIds, message);
			return false;
		} finally {
			options.setActiveScan(null);
		}
	}

	async function runStages(stages: readonly ScanStage[], allowActiveScan = false) {
		if (!allowActiveScan && options.getActiveScan() !== null) return;

		options.setActiveScan('all');
		for (const stage of stages) options.setScanStatus(stage, 'pending');

		let currentStage = stages[0];
		try {
			let response: HoudiniDiscoveryResponse | undefined;
			for (const stage of stages) {
				currentStage = stage;
				response = await performScanStage(stage);
				options.recordScanActivity(stage, 'success');
			}
			if (response) options.reconcileSelectedNode(response);
		} catch (error) {
			const message = options.getErrorMessage(error);
			options.setScanStatus(currentStage, 'error', message);
			options.recordScanActivity(currentStage, 'error', [], message);
		} finally {
			options.setActiveScan(null);
		}
	}

	return {
		runStage,
		runInitialScan: async () => {
			if (options.getInitialScanStarted() && options.getActiveScan() !== null) return;
			options.setInitialScanStarted(true);
			await runStages(options.stages.slice(0, 2), true);
		},
		runGlobalScan: () => runStages(options.stages)
	};
}
