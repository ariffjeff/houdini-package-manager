import type { ActivationTarget } from './types';

export type TargetIssueDetails = {
	installId: string;
	installLabel: string;
	packageFile: string;
	target: ActivationTarget;
	summary: string;
	messages: string[];
};
