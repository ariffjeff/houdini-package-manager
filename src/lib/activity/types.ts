export type ActivityEventKind =
	'scan' | 'sync' | 'plugin' | 'hconfig' | 'install' | 'migration' | 'config';

export type ActivityEventStatus = 'success' | 'error' | 'cancelled';

export type ActivityEvent = {
	id: string;
	timestamp: string;
	kind: ActivityEventKind;
	status: ActivityEventStatus;
	title: string;
	detail: string;
};
