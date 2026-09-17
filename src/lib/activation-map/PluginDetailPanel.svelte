<script lang="ts">
	import {
		Check,
		CloudSync,
		Cog,
		FileCog,
		FolderCode,
		GitBranch,
		Globe,
		GlobeOff,
		HardDriveDownload,
		RefreshCw,
		Square,
		Tag,
		TriangleAlert
	} from '@lucide/svelte';
	import { hasTargetIssues } from '$lib/houdini/known-issues';
	import type { InstallDialogState } from '$lib/plugin-install/types';
	import type { PluginSource, PluginRecord } from '$lib/houdini/types';
	import type { ActivationTarget, HoudiniInstall } from './types';
	import {
		compactPath,
		installedVersionLabel,
		installBuildLabels,
		sourceTargets,
		type PluginDetailAction,
		type PluginDetailActionState,
		type PluginTargetGroup
	} from './plugin-detail';
	import { statusLabel } from './model';

	let {
		plugin,
		officialPlugins,
		install,
		selectedTargets,
		pluginTargetGroups,
		pluginGitSource,
		pluginVersions,
		activationPlugins,
		isScanActive,
		pluginScanState,
		pluginActionState,
		gitSyncState,
		gitSyncMessage,
		installState,
		installMessage,
		onRescanPluginConfigs,
		onSyncGit,
		onPluginAction,
		onOpenTargetConfig,
		onOpenTargetIssueDetails,
		onOpenInstallDialog
	} = $props<{
		plugin?: PluginRecord;
		officialPlugins: PluginRecord[];
		install?: HoudiniInstall;
		selectedTargets: ActivationTarget[];
		pluginTargetGroups: PluginTargetGroup[];
		pluginGitSource?: PluginSource;
		pluginVersions: string[];
		activationPlugins: PluginRecord[];
		isScanActive: boolean;
		pluginScanState: PluginDetailActionState;
		pluginActionState: PluginDetailActionState;
		gitSyncState: PluginDetailActionState;
		gitSyncMessage: string;
		installState: InstallDialogState;
		installMessage: string;
		onRescanPluginConfigs: () => void | Promise<void>;
		onSyncGit: () => void | Promise<void>;
		onPluginAction: (request: PluginDetailAction) => void | Promise<void>;
		onOpenTargetConfig: (install: HoudiniInstall, target: ActivationTarget) => void;
		onOpenTargetIssueDetails: (install: HoudiniInstall, target: ActivationTarget) => void;
		onOpenInstallDialog: () => void;
	}>();

	function stopActionPropagation(event: MouseEvent) {
		event.stopPropagation();
	}
</script>

<aside class="detail-panel" aria-live="polite">
	{#if plugin}
		<p class="section-kicker">Plugin metadata</p>
		<div class="plugin-header">
			<h3>{plugin.name}</h3>
			{#if plugin.author}
				<span class="node-author">{plugin.author}</span>
			{/if}
		</div>
		<div class="detail-meta">
			<button
				type="button"
				class="detail-meta-item node-action-button icon-action-button plugin-rescan-button"
				aria-label={pluginScanState === 'working'
					? 'Rescanning plugin configs'
					: 'Rescan plugin configs'}
				data-tooltip={pluginScanState === 'working'
					? 'Rescanning plugin configs'
					: 'Rescan plugin configs'}
				disabled={isScanActive || pluginScanState === 'working'}
				onclick={(event) => {
					stopActionPropagation(event);
					void onRescanPluginConfigs();
				}}
			>
				<RefreshCw size={18} strokeWidth={1.8} aria-hidden="true" />
			</button>
			{#if plugin.repositoryUrl}
				<a
					class="detail-meta-item detail-meta-link"
					href={plugin.repositoryUrl}
					target="_blank"
					rel="external noopener noreferrer"
					aria-label="Open remote repository"
					data-tooltip="Open remote repository"
				>
					<Globe class="detail-meta-icon" size={22} strokeWidth={1.8} aria-hidden="true" />
				</a>
			{:else}
				<span
					class="detail-meta-item"
					class:is-negative={true}
					role="img"
					aria-label="No remote repository"
					data-tooltip="No remote repository"
				>
					<GlobeOff class="detail-meta-icon" size={22} strokeWidth={1.8} aria-hidden="true" />
				</span>
			{/if}
			<span
				class="detail-meta-item version-control-meta"
				class:is-negative={!pluginGitSource}
				role="img"
				aria-label={pluginGitSource
					? `Version controlled${pluginGitSource.gitBranch ? `, ${pluginGitSource.gitBranch}` : ''}: ${installedVersionLabel(plugin)} branch`
					: 'No version control'}
				data-tooltip={pluginGitSource
					? pluginGitSource.gitBranch
						? `Version controlled, ${pluginGitSource.gitBranch} branch`
						: 'Version controlled'
					: 'No version control'}
			>
				<GitBranch class="detail-meta-icon" size={22} strokeWidth={1.8} aria-hidden="true" />
				{#if pluginGitSource && plugin.installedVersions?.length}
					<span class="detail-meta-version-box">
						{#if pluginGitSource.gitTag}
							<Tag size={13} strokeWidth={2} aria-hidden="true" />
						{/if}
						<strong class="detail-meta-version">{installedVersionLabel(plugin)}</strong>
					</span>
				{/if}
				{#if pluginGitSource?.gitBranch}
					<span class="detail-meta-branch">{pluginGitSource.gitBranch}</span>
				{/if}
			</span>
		</div>
		{#if plugin.sources?.some((source: PluginSource) => source.exists)}
			<section class="panel-section source-list" aria-labelledby="local-sources-title">
				<div class="panel-section-heading">
					<div>
						<h4 id="local-sources-title">Local Sources</h4>
						<p>Valid sources derived from package configs</p>
					</div>
					<strong class="panel-section-count"
						>{plugin.sources.filter((source: PluginSource) => source.exists).length}</strong
					>
				</div>
				<div class="target-list">
					{#each plugin.sources as source (source.path)}
						{#if source.exists}
							<div class="target-item target-item-actions source-item">
								<div class="target-actions">
									<div
										class="node-action-row"
										aria-label={`${source.version ?? 'Source'} plugin actions`}
									>
										<button
											type="button"
											class="node-action-button icon-action-button"
											aria-label={`Open plugin folder for ${plugin.name} at ${source.path}`}
											data-tooltip="Open plugin folder"
											disabled={isScanActive || pluginActionState === 'working'}
											onclick={(event) => {
												stopActionPropagation(event);
												void onPluginAction({ action: 'open-source', sourcePath: source.path });
											}}
										>
											<FolderCode
												class="detail-meta-icon"
												size={22}
												strokeWidth={1.8}
												aria-hidden="true"
											/>
										</button>
									</div>
								</div>
								<div>
									<div class="source-version-label">
										{#if pluginGitSource?.gitTag}
											<Tag size={13} strokeWidth={2} aria-hidden="true" />
										{/if}
										<strong>{source.version ?? 'Unversioned source'}</strong>
									</div>
									<small>{source.path}</small>
									{#if sourceTargets(plugin, pluginTargetGroups, source.path).length}
										<div
											class="source-target-versions"
											aria-label={`Houdini configs pointing to ${source.path}`}
										>
											<span>Configs:</span>
											{#each sourceTargets(plugin, pluginTargetGroups, source.path) as sourceTarget (sourceTarget.representativeInstall.version)}
												<button
													type="button"
													class="source-version-button"
													aria-label={`Edit ${plugin.name} config for Houdini ${sourceTarget.representativeInstall.version}`}
													disabled={isScanActive || pluginActionState === 'working'}
													onclick={() =>
														onOpenTargetConfig(
															sourceTarget.representativeInstall,
															sourceTarget.target
														)}
												>
													{sourceTarget.representativeInstall.version}
												</button>
											{/each}
										</div>
									{/if}
								</div>
							</div>
						{/if}
					{/each}
				</div>
			</section>
		{/if}
		{#if plugin.repositoryUrl || pluginVersions.length || installMessage}
			<div class="panel-section plugin-actions">
				<div class="panel-section-heading remote-source-heading m-0">
					<div>
						<h4 id="remote-sources-title">Remote Source</h4>
						<p>Derived from /.git</p>
					</div>
				</div>
				<div class="remote-source-block">
					<div class="remote-source-actions">
						{#if plugin.repositoryUrl}
							<button
								type="button"
								class="sync-button"
								aria-label="Sync Git"
								disabled={isScanActive || gitSyncState === 'working'}
								data-tooltip="Sync git metadata"
								onclick={(event) => {
									stopActionPropagation(event);
									void onSyncGit();
								}}
							>
								<CloudSync
									class="detail-meta-icon"
									size={22}
									strokeWidth={1.8}
									aria-hidden="true"
								/>
							</button>
							<a
								class="source-button"
								href={plugin.repositoryUrl}
								aria-label="Open source"
								target="_blank"
								rel="external noopener noreferrer"
								data-tooltip="Open remote repository"
							>
								<Globe class="detail-meta-icon" size={22} strokeWidth={1.8} aria-hidden="true" />
							</a>
						{/if}
						{#if pluginVersions.length}
							{#if !plugin.installedVersions?.includes(pluginVersions[0])}
								<span class="new-version-note">
									New:
									{#if pluginGitSource?.availableVersions?.includes(pluginVersions[0])}
										<Tag size={13} strokeWidth={2} aria-hidden="true" />
									{/if}
									<span>{pluginVersions[0]}</span>
								</span>
							{/if}
							<button
								type="button"
								class="install-button"
								aria-label={`Configure remote install for ${plugin.name}`}
								disabled={installState === 'working'}
								onclick={onOpenInstallDialog}
								data-tooltip="Choose install options"
							>
								<HardDriveDownload class="install-icon" />
								<Cog class="install-icon" />
							</button>
						{/if}
					</div>
					{#if gitSyncMessage}
						<p class={['git-sync-message', `is-${gitSyncState}`]} aria-live="polite">
							{gitSyncMessage}
						</p>
					{/if}
				</div>
				{#if installMessage}
					<p class={['install-message', `is-${installState}`]} aria-live="polite">
						{installMessage}
					</p>
				{/if}
			</div>
		{/if}
		<section class="panel-section target-section" aria-labelledby="target-installs-title">
			<div class="panel-section-heading">
				<div>
					<h4 id="target-installs-title">Target installs</h4>
					<p>Package status by Houdini version</p>
				</div>
				<strong class="panel-section-count">{pluginTargetGroups.length}</strong>
			</div>
			<div class="target-list">
				{#each pluginTargetGroups as group (group.representativeInstall.version)}
					{@const currentInstall = group.representativeInstall}
					{@const target = group.target}
					{@const sourcePaths = target.sourcePaths ?? []}
					<div class={['target-item', 'target-item-actions', `target-item-${target.status}`]}>
						<div class="target-actions target-primary-actions">
							<div class="node-action-row" aria-label={`${currentInstall.label} primary actions`}>
								<button
									type="button"
									class={[
										'node-action-button',
										'toggle-action',
										target.status === 'enabled' ? 'is-enabled' : 'is-disabled',
										['warning', 'incompatible', 'missing'].includes(target.status)
											? 'is-config-error'
											: ''
									]}
									aria-label={`${target.status === 'enabled' ? 'Disable' : 'Enable'} plugin for ${currentInstall.label}`}
									data-tooltip={`${target.status === 'enabled' ? 'Disable' : 'Enable'} plugin`}
									disabled={isScanActive ||
										pluginActionState === 'working' ||
										['warning', 'incompatible', 'missing'].includes(target.status)}
									onclick={(event) => {
										stopActionPropagation(event);
										void onPluginAction({
											action: 'set-enabled',
											installId: currentInstall.id,
											enabled: target.status !== 'enabled'
										});
									}}
								>
									{#if target.status === 'enabled'}
										<Check class="action-icon" size={18} strokeWidth={2.2} aria-hidden="true" />
									{:else}
										<Square class="action-icon" size={18} strokeWidth={2.2} aria-hidden="true" />
									{/if}
								</button>
								<button
									type="button"
									class="node-action-button icon-action-button"
									class:issue-config-button={hasTargetIssues(target)}
									aria-label={`Edit Live JSON Editor for ${currentInstall.label}`}
									data-tooltip="Live JSON editor"
									disabled={isScanActive || pluginActionState === 'working'}
									onclick={(event) => {
										stopActionPropagation(event);
										void onOpenTargetConfig(currentInstall, target);
									}}
								>
									<Cog size={22} strokeWidth={1.8} aria-hidden="true" />
								</button>
								<button
									type="button"
									class={[
										'node-action-button',
										'icon-action-button',
										target.usesLegacyPath ||
										['warning', 'incompatible', 'missing'].includes(target.status)
											? 'issue-config-button'
											: ''
									]}
									aria-label={`Open JSON config for ${currentInstall.label}`}
									data-tooltip="Open JSON config"
									disabled={isScanActive || pluginActionState === 'working'}
									onclick={(event) => {
										stopActionPropagation(event);
										void onPluginAction({
											action: 'open-config',
											installId: currentInstall.id
										});
									}}
								>
									<FileCog size={22} strokeWidth={1.8} aria-hidden="true" />
								</button>
								<button
									type="button"
									class="node-action-button icon-action-button"
									aria-label={`Open packages folder for ${currentInstall.label}`}
									data-tooltip="Open packages folder"
									disabled={isScanActive || pluginActionState === 'working'}
									onclick={(event) => {
										stopActionPropagation(event);
										void onPluginAction({
											action: 'open-package-folder',
											installId: currentInstall.id
										});
									}}
								>
									<FolderCode
										class="detail-meta-icon"
										size={22}
										strokeWidth={1.8}
										aria-hidden="true"
									/>
								</button>
							</div>
						</div>
						<div class="target-install-label">
							<strong>{currentInstall.label}</strong>
							<span class="target-plugin-version">
								<Tag size={13} strokeWidth={2} aria-hidden="true" />
								{target.artifactVersion ?? 'Version unresolved'}
							</span>
							<small
								class="target-plugin-location"
								title={sourcePaths.join('\n') || 'No plugin source configured'}
							>
								{sourcePaths.length
									? `${compactPath(sourcePaths[0])}${sourcePaths.length > 1 ? ` + ${sourcePaths.length - 1} more` : ''}`
									: 'No plugin source configured'}
							</small>
							<div class="target-builds" aria-label="Install builds">
								{#each installBuildLabels(group.installs) as build (build)}
									<span data-tooltip={`Build ${build}`}>{build}</span>
								{/each}
							</div>
						</div>
						<div class="target-actions target-status-actions">
							{#if hasTargetIssues(target)}
								<button
									type="button"
									class="node-action-button icon-action-button issue-config-button"
									aria-label={`Open issue list for ${currentInstall.label}`}
									data-tooltip="Open issue list"
									disabled={isScanActive || pluginActionState === 'working'}
									onclick={(event) => {
										stopActionPropagation(event);
										onOpenTargetIssueDetails(currentInstall, target);
									}}
								>
									<TriangleAlert size={18} strokeWidth={1.9} aria-hidden="true" />
								</button>
							{/if}
							<div class="node-action-row" aria-label={`${currentInstall.label} plugin actions`}>
								{#if ['warning', 'incompatible', 'missing'].includes(target.status)}
									<button
										type="button"
										class="node-action-button icon-action-button issue-refresh-button"
										aria-label={`Rescan config for ${currentInstall.label}`}
										data-tooltip="Rescan config"
										disabled={isScanActive || pluginScanState === 'working'}
										onclick={(event) => {
											stopActionPropagation(event);
											void onRescanPluginConfigs();
										}}
									>
										<RefreshCw size={18} strokeWidth={1.9} aria-hidden="true" />
									</button>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		</section>
	{:else if officialPlugins.length}
		<p class="section-kicker">Official package group</p>
		<h3>Official Houdini packages</h3>
		<p class="detail-description">
			These package configs ship with Houdini or SideFX Labs and are grouped here to keep the map
			focused on user-installed plugins.
		</p>
		<div class="detail-meta">
			<span>SideFX</span>
			<span>{officialPlugins.length} package configs</span>
			<span>Install + site roots</span>
		</div>
		<div class="target-heading">
			<span>Included packages</span>
			<span>{officialPlugins.length}</span>
		</div>
		<div class="target-list">
			{#each officialPlugins as officialPlugin (officialPlugin.id)}
				{@const packageTargets = selectedTargets.filter(
					(target: ActivationTarget) => target.pluginId === officialPlugin.id
				)}
				{@const enabledTargets = packageTargets.filter(
					(target: ActivationTarget) => target.status === 'enabled'
				).length}
				<div class="target-item">
					<div>
						<strong>{officialPlugin.name}</strong>
						<small
							>{officialPlugin.packageFile} / {officialPlugin.origin} / {enabledTargets} enabled targets</small
						>
					</div>
					<span class="status-pill status-enabled">Official</span>
				</div>
			{/each}
		</div>
	{:else if install}
		<p class="section-kicker">Install detail</p>
		<h3>{install.label}</h3>
		<p class="detail-description">
			{install.role}. hconfig resolved {install.packageCount} package configs for this install.
		</p>
		<div class="install-facts">
			<div><span>Build</span><strong>{install.build}</strong></div>
			<div><span>Platform</span><strong>{install.platform}</strong></div>
			<div><span>Packages</span><strong>{install.packageCount}</strong></div>
		</div>
		<div class="path-facts">
			<div><span>HFS</span><code>{install.hfs}</code></div>
			<div><span>hconfig</span><code>{install.hconfig}</code></div>
			<div><span>User preferences</span><code>{install.userPreferences}</code></div>
			<div><span>User package directory</span><code>{install.packageDirectory}</code></div>
		</div>
		<div class="package-roots">
			<span>Scanned package roots</span>
			{#each install.packageRoots as root (root.path)}
				<code>{root.origin}: {root.path}</code>
			{/each}
		</div>
		{#if install.diagnostics.length}
			<div class="diagnostics">
				<strong>Scan diagnostics</strong>
				{#each install.diagnostics as diagnostic (diagnostic)}
					<p>{diagnostic}</p>
				{/each}
			</div>
		{/if}
		<div class="target-heading">
			<span>Plugin targets</span>
			<span>{selectedTargets.length}</span>
		</div>
		<div class="target-list">
			{#each selectedTargets as target (target.pluginId)}
				{@const targetPlugin = activationPlugins.find(
					(item: PluginRecord) => item.id === target.pluginId
				)}
				<div class="target-item">
					<div>
						<strong>{targetPlugin?.name}</strong>
						<small>{target.artifactVersion ?? 'No artifact resolved'}</small>
					</div>
					<span class={['status-pill', `status-${target.status}`]}
						>{statusLabel(target.status)}</span
					>
				</div>
			{/each}
		</div>
	{:else}
		<div class="detail-empty">
			<span class="empty-mark">+</span>
			<p>Select a node to inspect its targets.</p>
		</div>
	{/if}
</aside>

<style>
	.detail-panel {
		position: relative;
		z-index: 2;
		min-height: 0;
		overflow-y: auto;
		padding: 0 24px;
	}

	.detail-meta-item::after,
	.icon-action-button::after,
	.toggle-action::after,
	.target-builds span::after {
		display: none;
	}

	.detail-panel h3 {
		font-size: 27px;
		font-weight: 600;
		letter-spacing: -0.02em;
		line-height: normal;
	}

	.plugin-header {
		margin-bottom: 12px;
	}

	.detail-description {
		margin-bottom: 18px;
		color: var(--text-muted);
		font-size: 13px;
		line-height: 1.55;
	}

	.detail-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 18px;
	}

	.detail-meta span,
	.detail-meta a,
	.detail-meta button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 5px 7px;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: transparent;
		color: var(--text-muted);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
		font: inherit;
	}

	.detail-meta-link {
		transition:
			border-color 120ms ease,
			background-color 120ms ease,
			color 120ms ease;
		text-decoration: none;
	}

	.detail-meta-link:hover,
	.detail-meta-link:focus-visible {
		border-color: rgba(57, 155, 130, 0.7);
		background: rgba(57, 155, 130, 0.08);
		color: #55c4a5;
		outline: none;
	}

	.detail-meta .detail-meta-item {
		position: relative;
		width: 36px;
		height: 36px;
		justify-content: center;
		padding: 6px;
		color: #399b82;
		line-height: 1;
	}

	.detail-meta .version-control-meta {
		width: auto;
		min-width: 36px;
	}

	.detail-meta-item::after {
		content: attr(data-tooltip);
		position: absolute;
		top: calc(100% + 7px);
		left: 0;
		z-index: 10;
		padding: 7px 9px;
		border: 1px solid rgba(211, 232, 225, 0.18);
		border-radius: 4px;
		background: #17221f;
		box-shadow: 0 8px 18px rgba(0, 0, 0, 0.22);
		color: var(--text);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
		font-weight: 400;
		line-height: 1.35;
		pointer-events: none;
		white-space: nowrap;
		opacity: 0;
		transform: translateY(-3px);
		transition:
			opacity 120ms ease,
			transform 120ms ease;
	}

	.detail-meta-item:hover::after {
		opacity: 1;
		transform: translateY(0);
	}

	.detail-meta-item.is-negative {
		border-color: rgba(223, 109, 88, 0.4);
		color: #df6d58;
	}

	.detail-meta-icon {
		flex: 0 0 auto;
	}

	.detail-meta-version {
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 14px;
		font-weight: 600;
		line-height: 1;
	}

	.detail-meta-version-box {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 4px 6px;
		border: 1px solid rgba(57, 155, 130, 0.3);
		border-radius: 4px;
		background: rgba(57, 155, 130, 0.08);
	}

	.detail-meta-branch {
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
		line-height: 1;
	}

	.panel-section {
		margin-bottom: 18px;
		padding: 14px;
		border: 1px solid rgba(211, 232, 225, 0.1);
		border-radius: 7px;
		background: rgba(255, 255, 255, 0.025);
	}

	.panel-section-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: 10px;
	}

	.panel-section-heading h4,
	.panel-section-heading p {
		margin: 0;
	}

	.panel-section-heading h4 {
		color: var(--text);
		font-size: 14px;
		font-weight: 600;
		letter-spacing: 0;
		text-transform: none;
	}

	.panel-section-heading p {
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 11px;
		line-height: 1.4;
	}

	.panel-section-count {
		min-width: 28px;
		color: #399b82;
		font-size: 20px;
		font-weight: 600;
		line-height: 1;
		text-align: left;
	}

	.source-list .target-list,
	.target-section .target-list {
		margin: 0 -14px -14px;
		padding: 0 14px;
	}

	.source-list .target-item:first-child,
	.target-section .target-item:first-child {
		border-top-color: rgba(211, 232, 225, 0.18);
	}

	.plugin-actions {
		display: flex;
		flex-direction: column;
		margin-bottom: 18px;
	}

	.node-action-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}

	.node-action-button {
		min-width: 0;
		padding: 7px 8px;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: var(--surface-raised);
		color: var(--text-muted);
		cursor: pointer;
		font-size: 10px;
		font-weight: 600;
		line-height: 1.25;
	}

	.node-action-button:hover,
	.node-action-button:focus-visible {
		border-color: #399b82;
		color: var(--text);
		outline: none;
	}

	.icon-action-button {
		position: relative;
	}

	.icon-action-button::after {
		content: attr(data-tooltip);
		position: absolute;
		top: calc(100% + 6px);
		left: 50%;
		z-index: 5;
		padding: 6px 8px;
		border: 1px solid rgba(211, 232, 225, 0.18);
		border-radius: 4px;
		background: #17221f;
		box-shadow: 0 8px 18px rgba(0, 0, 0, 0.22);
		color: var(--text);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
		font-weight: 400;
		line-height: 1.35;
		pointer-events: none;
		white-space: nowrap;
		opacity: 0;
		transform: translate(-50%, -3px);
		transition:
			opacity 120ms ease,
			transform 120ms ease;
	}

	.icon-action-button:hover::after,
	.icon-action-button:focus-visible::after {
		opacity: 1;
		transform: translate(-50%, 0);
	}

	.toggle-action {
		position: relative;
		display: inline-flex;
		width: 34px;
		height: 34px;
		align-items: center;
		justify-content: center;
		padding: 0;
	}

	.toggle-action::after {
		content: attr(data-tooltip);
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		z-index: 5;
		padding: 6px 8px;
		border: 1px solid rgba(211, 232, 225, 0.18);
		border-radius: 4px;
		background: #17221f;
		box-shadow: 0 8px 18px rgba(0, 0, 0, 0.22);
		color: var(--text);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
		font-weight: 400;
		line-height: 1.35;
		pointer-events: none;
		white-space: nowrap;
		opacity: 0;
		transform: translateY(-3px);
		transition:
			opacity 120ms ease,
			transform 120ms ease;
	}

	.toggle-action:hover::after,
	.toggle-action:focus-visible::after {
		opacity: 1;
		transform: translateY(0);
	}

	.toggle-action.is-enabled {
		border-color: rgba(57, 155, 130, 0.5);
		background: rgba(57, 155, 130, 0.12);
		color: #55c4a5;
	}

	.toggle-action.is-disabled {
		border-color: rgba(173, 119, 105, 0.5);
		background: rgba(173, 119, 105, 0.12);
		color: #d49b8b;
	}

	.toggle-action.is-enabled:hover,
	.toggle-action.is-enabled:focus-visible {
		border-color: #55c4a5;
		background: rgba(57, 155, 130, 0.22);
	}

	.toggle-action.is-disabled:hover,
	.toggle-action.is-disabled:focus-visible {
		border-color: #d49b8b;
		background: rgba(173, 119, 105, 0.22);
	}

	.node-action-button.danger {
		border-color: rgba(223, 109, 88, 0.42);
		color: #df6d58;
	}

	.node-action-button:disabled {
		cursor: wait;
		opacity: 0.55;
	}

	.issue-refresh-button {
		border-color: rgba(211, 155, 56, 0.55);
		background: rgba(211, 155, 56, 0.1);
		color: #d39b38;
	}

	.issue-refresh-button:hover:not(:disabled),
	.issue-refresh-button:focus-visible:not(:disabled) {
		border-color: #d39b38;
		background: rgba(211, 155, 56, 0.2);
		color: #f0bd55;
	}

	.icon-action-button {
		display: inline-flex;
		width: 34px;
		height: 34px;
		align-items: center;
		justify-content: center;
		padding: 0;
		flex: 0 0 34px;
	}

	.remote-source-block {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px 16px;
		padding-top: 2px;
	}

	.remote-source-heading {
		align-items: flex-start;
		flex-direction: column;
	}

	.remote-source-actions {
		display: flex;
		min-width: 0;
		align-items: center;
		justify-content: flex-start;
		gap: 6px;
		white-space: nowrap;
	}

	.remote-source-actions .source-button,
	.remote-source-actions .sync-button {
		white-space: nowrap;
	}

	.remote-source-block .git-sync-message {
		grid-column: 1 / -1;
		margin: 0;
	}

	.source-button,
	.sync-button,
	.install-button,
	.cancel-button {
		align-self: flex-start;
		padding: 7px 10px;
		border: 1px solid var(--line-strong);
		border-radius: 5px;
		background: var(--surface-raised);
		color: var(--text);
		cursor: pointer;
		font-size: 11px;
		font-weight: 600;
		text-decoration: none;
	}

	.install-button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		border-color: rgba(57, 155, 130, 0.5);
		background: rgba(57, 155, 130, 0.1);
		color: #8de0c5;
	}

	.new-version-note {
		display: inline-flex;
		height: 38px;
		align-items: center;
		box-sizing: border-box;
		gap: 5px;
		padding: 0 8px;
		border: 1px solid rgba(211, 155, 56, 0.4);
		border-radius: 4px;
		background: rgba(211, 155, 56, 0.09);
		color: #d39b38;
		font-size: 14px;
		line-height: 1;
	}

	.source-button:hover,
	.source-button:focus-visible,
	.sync-button:hover,
	.sync-button:focus-visible,
	.install-button:hover,
	.install-button:focus-visible,
	.cancel-button:hover,
	.cancel-button:focus-visible {
		border-color: #399b82;
		outline: none;
	}

	.install-button:disabled,
	.sync-button:disabled {
		cursor: wait;
		opacity: 0.55;
	}

	.git-sync-message,
	.install-message {
		margin: 0;
		color: var(--text-muted);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
		line-height: 1.45;
	}

	.git-sync-message.is-success,
	.install-message.is-success {
		color: #399b82;
	}

	.git-sync-message.is-error,
	.install-message.is-error {
		color: #df6d58;
	}

	.target-heading {
		display: flex;
		justify-content: space-between;
		margin-bottom: 12px;
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.target-list {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.target-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 0;
		border-top: 1px solid var(--line);
	}

	.target-section .target-item {
		padding-inline: 10px;
		border-radius: 4px;
	}

	.target-section .target-item-enabled {
		background: rgba(57, 155, 130, 0.07);
	}

	.target-section .target-item-disabled {
		background: rgba(173, 119, 105, 0.07);
	}

	.target-section .target-item-warning {
		background: rgba(211, 155, 56, 0.07);
	}

	.target-section .target-item-incompatible,
	.target-section .target-item-missing {
		background: rgba(223, 109, 88, 0.07);
	}

	.target-item-actions {
		align-items: flex-start;
		flex-direction: column;
	}

	.source-item {
		align-items: center;
		flex-direction: row;
		justify-content: flex-start;
		gap: 10px;
	}

	.source-item > div:last-child {
		min-width: 0;
	}

	.source-version-label {
		display: flex;
		align-items: center;
		gap: 5px;
	}

	.source-version-label :global(svg) {
		flex: 0 0 auto;
	}

	.source-target-versions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 5px;
		margin-top: 7px;
	}

	.source-target-versions > span {
		color: var(--text-muted);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
		text-transform: uppercase;
	}

	.source-version-button {
		padding: 3px 7px;
		border: 1px solid rgba(57, 155, 130, 0.45);
		border-radius: 3px;
		background: rgba(57, 155, 130, 0.09);
		color: #9ed7c7;
		font-size: 11px;
		line-height: 1.2;
		cursor: pointer;
	}

	.source-version-button:hover:not(:disabled),
	.source-version-button:focus-visible:not(:disabled) {
		border-color: #55b79d;
		background: rgba(57, 155, 130, 0.18);
		color: var(--text);
		outline: none;
	}

	.source-version-button:disabled {
		cursor: wait;
		opacity: 0.5;
	}

	.target-section .target-item-actions {
		align-items: center;
		flex-direction: row;
		justify-content: flex-start;
		gap: 25px;
	}

	.target-primary-actions {
		order: -1;
	}

	.target-status-actions {
		margin-left: auto;
	}

	.target-install-label {
		min-width: 0;
		flex: 1 1 auto;
		overflow: hidden;
	}

	.target-plugin-version {
		display: inline-flex;
		position: relative;
		align-items: center;
		gap: 5px;
		margin-top: 7px;
		padding: 4px 7px;
		border: 1px solid rgba(211, 155, 56, 0.4);
		border-radius: 4px;
		background: rgba(211, 155, 56, 0.09);
		color: #e2b95f;
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
		font-weight: 600;
		line-height: 1;
	}

	.target-plugin-version::after {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		z-index: 5;
		padding: 6px 8px;
		border: 1px solid rgba(211, 232, 225, 0.18);
		border-radius: 4px;
		background: #17221f;
		box-shadow: 0 8px 18px rgba(0, 0, 0, 0.22);
		color: var(--text);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
		font-weight: 400;
		line-height: 1.35;
		pointer-events: none;
		white-space: nowrap;
		opacity: 0;
		transform: translateY(-3px);
		transition:
			opacity 120ms ease,
			transform 120ms ease;
	}

	.target-plugin-version:hover::after,
	.target-plugin-version:focus-visible::after {
		opacity: 1;
		transform: translateY(0);
	}

	.target-actions {
		display: flex;
		flex: 0 0 auto;
		width: auto;
		align-items: flex-start;
		margin-left: 0;
		gap: 10px;
	}

	.target-actions .node-action-row {
		flex: 1;
	}

	.toggle-action.is-config-error {
		border-color: var(--line);
		background: rgba(135, 148, 143, 0.1);
		color: var(--text-dim);
	}

	.issue-config-button {
		border-color: rgba(211, 155, 56, 0.55);
		background: rgba(211, 155, 56, 0.1);
		color: #d39b38;
	}

	.issue-config-button:hover:not(:disabled),
	.issue-config-button:focus-visible:not(:disabled) {
		border-color: #d39b38;
		background: rgba(211, 155, 56, 0.2);
	}

	.target-item strong,
	.target-item small {
		display: block;
	}

	.target-item strong {
		font-size: 12px;
		font-weight: 600;
	}

	.target-item small {
		margin-top: 4px;
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
	}

	.target-plugin-location {
		max-width: min(42vw, 420px);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.target-builds {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		margin-top: 5px;
	}

	.target-builds span {
		position: relative;
		padding: 4px 7px;
		border: 1px solid rgba(211, 232, 225, 0.18);
		border-radius: 999px;
		background: rgba(211, 232, 225, 0.08);
		color: var(--text-muted);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 11px;
		font-weight: 600;
		line-height: 1;
	}

	.target-builds span::after {
		content: attr(data-tooltip);
		position: absolute;
		top: calc(100% + 6px);
		left: 50%;
		z-index: 5;
		padding: 6px 8px;
		border: 1px solid rgba(211, 232, 225, 0.18);
		border-radius: 4px;
		background: #17221f;
		box-shadow: 0 8px 18px rgba(0, 0, 0, 0.22);
		color: var(--text);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
		font-weight: 400;
		line-height: 1.35;
		pointer-events: none;
		white-space: nowrap;
		opacity: 0;
		transform: translate(-50%, -3px);
		transition:
			opacity 120ms ease,
			transform 120ms ease;
	}

	.target-builds span:hover::after,
	.target-builds span:focus-visible::after {
		opacity: 1;
		transform: translate(-50%, 0);
	}

	.status-pill {
		padding: 5px 7px;
		border-radius: 4px;
		background: rgba(57, 155, 130, 0.16);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
		font-weight: 600;
		white-space: nowrap;
	}

	.status-pill.status-disabled,
	.status-pill.status-missing {
		background: rgba(173, 119, 105, 0.18);
	}

	.status-pill.status-warning {
		background: rgba(211, 155, 56, 0.18);
	}

	.status-pill.status-incompatible {
		background: rgba(223, 109, 88, 0.18);
	}

	.install-facts {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
		margin: 26px 0 36px;
	}

	.install-facts div {
		padding: 10px 9px;
		border: 1px solid var(--line);
		border-radius: 5px;
	}

	.install-facts span,
	.install-facts strong {
		display: block;
	}

	.path-facts {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 28px;
	}

	.path-facts div {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--line);
	}

	.path-facts span,
	.path-facts code,
	.diagnostics strong,
	.diagnostics p {
		font-family: 'Cascadia Code', 'Courier New', monospace;
	}

	.path-facts span {
		color: var(--text-dim);
		font-size: 8px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.path-facts code {
		overflow-wrap: anywhere;
		color: var(--text-muted);
		font-size: 10px;
		line-height: 1.4;
	}

	.package-roots {
		display: flex;
		flex-direction: column;
		gap: 5px;
		margin: -18px 0 24px;
	}

	.package-roots > span {
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 8px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.package-roots code {
		overflow-wrap: anywhere;
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
		line-height: 1.4;
	}

	.diagnostics {
		margin-bottom: 24px;
		padding: 10px;
		border: 1px solid rgba(223, 109, 88, 0.32);
		border-radius: 5px;
		background: rgba(223, 109, 88, 0.07);
	}

	.diagnostics strong {
		color: #df6d58;
		font-size: 9px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.diagnostics p {
		margin: 7px 0 0;
		color: var(--text-muted);
		font-size: 10px;
		line-height: 1.45;
	}

	.install-facts span {
		margin-bottom: 5px;
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 8px;
		text-transform: uppercase;
	}

	.install-facts strong {
		font-size: 12px;
	}

	.detail-empty {
		display: flex;
		min-height: 280px;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		gap: 12px;
		color: var(--text-muted);
		text-align: center;
	}

	.detail-empty p {
		max-width: 170px;
		margin: 0;
		font-size: 12px;
		line-height: 1.5;
	}

	.empty-mark {
		display: grid;
		width: 36px;
		height: 36px;
		place-items: center;
		border: 1px dashed var(--line-strong);
		border-radius: 50%;
		color: var(--text-muted);
		font-size: 20px;
	}

	.node-author {
		display: block;
		width: 100%;
		margin: 0;
		color: #c4d2cd;
		font-size: 11px;
		line-height: 1.2;
	}

	@media (max-width: 1100px) {
		.detail-panel {
			min-height: 0;
			padding: 24px 4px 4px;
			overflow-y: auto;
			border-top: 1px solid rgba(38, 53, 55, 0.1);
			border-left: 0;
		}

		.detail-empty {
			min-height: 160px;
		}
	}

	@media (max-width: 760px) {
		.detail-panel h3 {
			font-size: 24px;
		}
	}
</style>
