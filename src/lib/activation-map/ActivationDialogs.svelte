<script lang="ts">
	import IssueChecker from './IssueChecker.svelte';
	import PluginUpdatesDialog from './PluginUpdatesDialog.svelte';
	import TargetIssueDialog from './TargetIssueDialog.svelte';
	import type { TargetIssueDetails } from './target-issue-dialog';
	import type { IssueConfigOption, IssueItem } from './issue-checker';
	import type { PluginUpdateItem } from './update-checker';
	import LiveJsonEditor from '$lib/live-json-editor/LiveJsonEditor.svelte';
	import type { ActivationTarget, HoudiniInstall, PluginRecord } from './types';
	import type { HoudiniDiscoveryResponse, HoudiniPluginMigrationRequest } from '$lib/houdini/types';
	import PluginInstallDialog from '$lib/plugin-install/PluginInstallDialog.svelte';
	import type {
		InstallDialogOptions,
		InstallDialogRequest,
		InstallDialogState,
		InstallDialogPlugin,
		InstallVersionOption
	} from '$lib/plugin-install/types';
	import PluginMigratorDialog from '$lib/plugin-migrator/PluginMigratorDialog.svelte';
	import SettingsPanel from '$lib/settings/SettingsPanel.svelte';
	import type { HpmLocalDataKind } from '$lib/settings/local-storage';

	type MigrationState = 'idle' | 'working' | 'success' | 'error';
	type LiveJsonEditorContext = {
		plugin: PluginRecord;
		install: HoudiniInstall;
		target: ActivationTarget;
	};

	let {
		settingsDialogOpen,
		installDialogOpen,
		installPlugin,
		installVersionOptions,
		activationInstalls,
		activationTargets,
		remoteSourceOptions,
		hpmPluginDestination,
		installState,
		installMessage,
		pluginMigratorOpen,
		activationPlugins,
		migrationState,
		migrationMessage,
		issuesDialogOpen,
		updatesDialogOpen,
		issueItems,
		pluginUpdateItems,
		pinnedPluginUpdateItems,
		issueConfigOptions,
		issueCheckerFilterId,
		groupIssueBuilds,
		liveJsonEditorContext,
		isScanActive,
		targetIssueDetails,
		pluginActionState,
		onCloseSettings,
		onActivitySettingsSaved,
		onCloseInstall,
		onCancelInstall,
		onInstall,
		onClosePluginMigrator,
		onMigrate,
		onCloseIssues,
		onCloseUpdates,
		onKeepCurrentUpdate,
		onUnpinUpdate,
		onSelectUpdate,
		onFilterChange,
		onGroupBuildsChange,
		onSelectIssue,
		onCloseLiveJsonEditor,
		onLiveJsonDiscovery,
		onCloseTargetIssue,
		onOpenTargetConfig,
		onOpenTargetEditor,
		onClearLocalData
	} = $props<{
		settingsDialogOpen: boolean;
		installDialogOpen: boolean;
		installPlugin: InstallDialogPlugin | undefined;
		installVersionOptions: InstallVersionOption[];
		activationInstalls: HoudiniInstall[];
		activationTargets: ActivationTarget[];
		remoteSourceOptions: string[];
		hpmPluginDestination: string;
		installState: InstallDialogState;
		installMessage: string;
		pluginMigratorOpen: boolean;
		activationPlugins: PluginRecord[];
		migrationState: MigrationState;
		migrationMessage: string;
		issuesDialogOpen: boolean;
		updatesDialogOpen: boolean;
		issueItems: IssueItem[];
		pluginUpdateItems: PluginUpdateItem[];
		pinnedPluginUpdateItems: PluginUpdateItem[];
		issueConfigOptions: IssueConfigOption[];
		issueCheckerFilterId: string;
		groupIssueBuilds: boolean;
		liveJsonEditorContext: LiveJsonEditorContext | null;
		isScanActive: boolean;
		targetIssueDetails: TargetIssueDetails | null;
		pluginActionState: 'idle' | 'working' | 'success' | 'error';
		onCloseSettings: () => void;
		onActivitySettingsSaved: () => void;
		onCloseInstall: () => void;
		onCancelInstall: () => void;
		onInstall: (
			request: InstallDialogRequest,
			options: InstallDialogOptions
		) => void | Promise<void>;
		onClosePluginMigrator: () => void;
		onMigrate: (request: HoudiniPluginMigrationRequest) => void;
		onCloseIssues: () => void;
		onCloseUpdates: () => void;
		onKeepCurrentUpdate: (update: PluginUpdateItem) => void;
		onUnpinUpdate: (update: PluginUpdateItem) => void;
		onSelectUpdate: (update: PluginUpdateItem) => void;
		onFilterChange: (filterId: string) => void;
		onGroupBuildsChange: (value: boolean) => void;
		onSelectIssue: (issue: IssueItem, target: ActivationTarget) => void;
		onCloseLiveJsonEditor: () => void;
		onLiveJsonDiscovery: (response: HoudiniDiscoveryResponse) => void;
		onCloseTargetIssue: () => void;
		onOpenTargetConfig: (installId: string) => void;
		onOpenTargetEditor: (installId: string, target: ActivationTarget) => void;
		onClearLocalData: (kind: HpmLocalDataKind | 'discovery-cache') => void | Promise<void>;
	}>();
</script>

{#if settingsDialogOpen}
	<div class="settings-dialog-backdrop">
		<button
			type="button"
			class="settings-dialog-dismiss"
			aria-label="Close settings dialog"
			onclick={onCloseSettings}
		></button>
		<dialog open class="settings-dialog" aria-labelledby="settings-dialog-title">
			<SettingsPanel onClose={onCloseSettings} {onActivitySettingsSaved} {onClearLocalData} />
		</dialog>
	</div>
{/if}
{#if installDialogOpen && installPlugin}
	<PluginInstallDialog
		plugin={installPlugin}
		versions={installVersionOptions}
		installs={activationInstalls}
		targets={activationTargets}
		{remoteSourceOptions}
		{hpmPluginDestination}
		{installState}
		message={installMessage}
		onClose={onCloseInstall}
		onCancel={onCancelInstall}
		{onInstall}
	/>
{/if}
{#if pluginMigratorOpen}
	<PluginMigratorDialog
		plugins={activationPlugins}
		installs={activationInstalls}
		targets={activationTargets}
		{migrationState}
		message={migrationMessage}
		onClose={onClosePluginMigrator}
		{onMigrate}
	/>
{/if}
{#if issuesDialogOpen}
	<IssueChecker
		{issueItems}
		{issueConfigOptions}
		installs={activationInstalls}
		filterId={issueCheckerFilterId}
		{groupIssueBuilds}
		onClose={onCloseIssues}
		{onFilterChange}
		{onGroupBuildsChange}
		{onSelectIssue}
	/>
{/if}
{#if updatesDialogOpen}
	<PluginUpdatesDialog
		updates={pluginUpdateItems}
		pinnedUpdates={pinnedPluginUpdateItems}
		onClose={onCloseUpdates}
		onKeepCurrent={onKeepCurrentUpdate}
		onUnpin={onUnpinUpdate}
		{onSelectUpdate}
	/>
{/if}
{#if liveJsonEditorContext}
	<LiveJsonEditor
		plugin={liveJsonEditorContext.plugin}
		install={liveJsonEditorContext.install}
		target={liveJsonEditorContext.target}
		targets={activationTargets}
		{isScanActive}
		onClose={onCloseLiveJsonEditor}
		onDiscovery={onLiveJsonDiscovery}
	/>
{/if}
{#if targetIssueDetails}
	<TargetIssueDialog
		details={targetIssueDetails}
		actionsDisabled={isScanActive || pluginActionState === 'working'}
		onClose={onCloseTargetIssue}
		onOpenConfig={onOpenTargetConfig}
		onOpenEditor={onOpenTargetEditor}
	/>
{/if}

<style>
	.settings-dialog-backdrop {
		position: fixed;
		inset: 0;
		z-index: 9000;
		display: grid;
		place-items: center;
		padding: 24px;
		background: rgba(9, 14, 15, 0.72);
	}

	.settings-dialog-dismiss {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
		background: transparent;
		cursor: default;
	}

	.settings-dialog {
		position: relative;
		z-index: 1;
		width: min(980px, 100%);
		max-height: calc(100dvh - 48px);
		margin: 0;
		padding: 0;
		overflow: auto;
		border: 1px solid var(--line-strong);
		border-radius: 8px;
		background: #182224;
		box-shadow: 0 22px 70px rgba(0, 0, 0, 0.42);
	}
</style>
