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
		InstallDialogState,
		InstallDialogPlugin,
		InstallDialogSelection,
		InstallVersionOption
	} from '$lib/plugin-install/types';
	import PluginMigratorDialog from '$lib/plugin-migrator/PluginMigratorDialog.svelte';

	type MigrationState = 'idle' | 'working' | 'success' | 'error';
	type LiveJsonEditorContext = {
		plugin: PluginRecord;
		install: HoudiniInstall;
		target: ActivationTarget;
	};

	let {
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
		onOpenTargetEditor
	} = $props<{
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
		onCloseInstall: () => void;
		onCancelInstall: () => void;
		onInstall: (
			selection: InstallDialogSelection,
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
	}>();
</script>

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
