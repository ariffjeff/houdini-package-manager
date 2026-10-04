export const settingsDialogState = $state({ open: false });

export function openSettingsDialog() {
	settingsDialogState.open = true;
}

export function closeSettingsDialog() {
	settingsDialogState.open = false;
}
