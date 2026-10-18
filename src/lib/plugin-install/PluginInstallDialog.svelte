<script lang="ts">
	import { onMount } from 'svelte';
	import GithubLogo from '$lib/assets/GithubLogo.svelte';
	import houdiniBadge from '$lib/assets/houdini_badge_flat.svg';
	import { compareVersionLabels } from '$lib/activation-map/plugin-detail';
	import {
		FileCheck2,
		GitCommitHorizontal,
		RotateCcw,
		ShieldCheck,
		Tag,
		TriangleAlert
	} from '@lucide/svelte';
	import type { ActivationTarget } from '$lib/activation-map/types';
	import type { HoudiniInstall, PackageManifestPreflight } from '$lib/houdini/types';
	import ConfigFixesPanel from '$lib/live-json-editor/ConfigFixesPanel.svelte';
	import PackageConfigControls from '$lib/live-json-editor/PackageConfigControls.svelte';
	import ConfigPreviewPanel from '$lib/live-json-editor/ConfigPreviewPanel.svelte';
	import { ingestPackageConfig } from '$lib/houdini/package-ingester';
	import {
		correctedConfigText,
		createConfigFixState,
		findConfigControlRanges,
		type ConfigFixState,
		updatePackageConfigText
	} from '$lib/live-json-editor/config-editor';
	import { configuredPluginDestination } from './destination';
	import type {
		InstallDialogOptions,
		InstallDialogState,
		InstallDialogPlugin,
		InstallDialogSelection,
		InstallVersionOption
	} from './types';

	type InstallDraft = {
		packageFile: string;
		version: string;
		selectedInstallIds: string[];
		destinationChoice: string;
		customDestination: string;
		manifestText: string;
		manifestTextInitial: string;
		openInstalledFolder: boolean;
		openInstalledConfig: boolean;
	};

	type ManifestEditMode = 'controls' | 'manual';

	let {
		plugin,
		versions,
		installs,
		targets,
		remoteSourceOptions,
		hpmPluginDestination,
		installState,
		message,
		presentation = 'dialog',
		onClose,
		onCancel,
		onInstall
	} = $props<{
		plugin: InstallDialogPlugin;
		versions: InstallVersionOption[];
		installs: HoudiniInstall[];
		targets: ActivationTarget[];
		remoteSourceOptions: string[];
		hpmPluginDestination: string;
		installState: InstallDialogState;
		message: string;
		presentation?: 'dialog' | 'page';
		onClose: () => void;
		onCancel: () => void;
		onInstall: (
			selection: InstallDialogSelection,
			options: InstallDialogOptions
		) => void | Promise<void>;
	}>();

	let draft = $state<InstallDraft>({
		packageFile: '',
		version: '',
		selectedInstallIds: [],
		destinationChoice: 'custom',
		customDestination: '',
		manifestText: '',
		manifestTextInitial: '',
		openInstalledFolder: false,
		openInstalledConfig: false
	});
	let manifestConfig = $state<Record<string, unknown> | null>(null);
	let manifestEditMode = $state<ManifestEditMode>('controls');
	let manifestModeError = $state('');
	let manifestDestination = $state('');
	let manifestFixState = $state<ConfigFixState>(createConfigFixState({}, { defaultHpath: '' }));
	let hoveredConfigController = $state<string | null>(null);
	let includeHpmMetadata = $state(true);
	let hpmMetadataChanged = $state(false);
	let showNonTaggedCommits = $state(false);
	let versionQuery = $state('');
	let packageFiles = $derived(
		plugin.packageFiles ?? (plugin.packageFile ? [plugin.packageFile] : [])
	);

	let visibleVersions = $derived(
		showNonTaggedCommits
			? versions
			: versions.filter((version: InstallVersionOption) => version.kind === 'tag')
	);
	let requestedVersion = $derived(
		visibleVersions.some((version: InstallVersionOption) => version.value === draft.version)
			? draft.version
			: (visibleVersions[0]?.value ?? '')
	);
	let selectedVersion = $derived(
		visibleVersions.find((version: InstallVersionOption) => version.value === requestedVersion)
	);
	let filteredVersions = $derived.by(() => {
		const query = versionQuery.trim().toLowerCase();

		return visibleVersions.filter((version: InstallVersionOption) => {
			const matchesQuery =
				!query ||
				(version.label ?? '').toLowerCase().includes(query) ||
				version.value.toLowerCase().includes(query);
			return matchesQuery || version.value === requestedVersion;
		});
	});
	let selectedInstallCount = $derived(
		installs.filter((install: HoudiniInstall) => draft.selectedInstallIds.includes(install.id))
			.length
	);
	let requestedDestination = $derived(
		draft.destinationChoice === 'custom' ? draft.customDestination.trim() : draft.destinationChoice
	);
	let customDestinationChanged = $derived(
		draft.destinationChoice === 'custom' && draft.customDestination.trim() !== manifestDestination
	);
	let selectedManifestPreflight = $derived<PackageManifestPreflight | undefined>(
		plugin.manifestPreflight?.[draft.packageFile]
	);
	let manifestDraftError = $derived.by(() => {
		if (!draft.manifestText.trim()) {
			return draft.manifestTextInitial
				? 'The corrected manifest cannot be empty. Restore the inspected JSON or enter a JSON object.'
				: '';
		}
		try {
			const parsed = JSON.parse(draft.manifestText) as unknown;
			if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
				return 'The corrected manifest must have a JSON object as its root.';
			}
		} catch {
			return 'The corrected manifest is not valid JSON.';
		}
		return '';
	});
	let manifestPreviewText = $derived(
		manifestConfig
			? correctedConfigText(
					manifestFixState,
					requestedDestination,
					draft.manifestText,
					requestedDestination !== manifestDestination
				)
			: ''
	);
	let installPreviewText = $derived.by(() => {
		const sourceText =
			manifestEditMode === 'controls' && manifestConfig ? manifestPreviewText : draft.manifestText;
		if (!includeHpmMetadata) return sourceText;
		const ingestion = ingestPackageConfig(sourceText, {
			hpath: requestedDestination,
			applyPathFixes: false,
			hpm: {
				managed: true,
				repository: plugin.repositoryUrl ?? '',
				version: requestedVersion,
				...(plugin.pinnedCommit ? { approvedCommit: plugin.pinnedCommit } : {}),
				...(plugin.manifestBlobSha ? { approvedManifestBlobSha: plugin.manifestBlobSha } : {})
			}
		});
		return (
			ingestion.text ?? (ingestion.config ? JSON.stringify(ingestion.config, null, 2) : sourceText)
		);
	});
	let destinationLockedRanges = $derived(
		findConfigControlRanges(
			installPreviewText,
			['path', 'hpath', 'HOUDINI_PATH'],
			'plugin-destination',
			'Plugin destination',
			manifestFixState.migrateLegacyPath
				? 'deprecated-path'
				: manifestFixState.applySourcePathFix
					? 'source-path-fix'
					: undefined,
			manifestFixState.migrateLegacyPath
				? 'Remove deprecated path'
				: 'Restore source path from another config'
		)
	);
	let evaluatedVariables = $derived(installs[0]?.variables ?? {});
	let manifestHasFatalIssue = $derived.by(() => {
		return (
			Boolean(manifestDraftError) ||
			Boolean(selectedManifestPreflight?.fatal && draft.manifestText === draft.manifestTextInitial)
		);
	});
	let canInstall = $derived(
		installState !== 'working' &&
			packageFiles.includes(draft.packageFile) &&
			!manifestHasFatalIssue &&
			Boolean(requestedVersion) &&
			visibleVersions.some((version: InstallVersionOption) => version.value === requestedVersion) &&
			selectedInstallCount > 0 &&
			Boolean(requestedDestination)
	);

	onMount(resetDraft);

	function resetDraft() {
		const existingSource = remoteSourceOptions[0] ?? hpmPluginDestination;
		const packageFile = plugin.packageFile ?? packageFiles[0] ?? '';
		const manifestText = plugin.manifestPreflight?.[packageFile]?.content ?? '';
		const configuredDestination = configuredPluginDestination(
			manifestText,
			evaluatedVariables,
			existingSource ?? ''
		);
		draft = {
			packageFile,
			version: visibleVersions[0]?.value ?? '',
			selectedInstallIds: [],
			destinationChoice: remoteSourceOptions.includes(configuredDestination)
				? configuredDestination
				: 'custom',
			customDestination: configuredDestination,
			manifestText,
			manifestTextInitial: manifestText,
			openInstalledFolder: false,
			openInstalledConfig: false
		};
		manifestDestination = configuredDestination;
		resetManifestCorrection(manifestText, configuredDestination);
		resetManifestEditMode(manifestText);
	}

	function selectPackageFile(packageFile: string) {
		const manifestText = plugin.manifestPreflight?.[packageFile]?.content ?? '';
		const configuredDestination = configuredPluginDestination(
			manifestText,
			evaluatedVariables,
			requestedDestination
		);
		draft = {
			...draft,
			packageFile,
			manifestText,
			manifestTextInitial: manifestText,
			destinationChoice: remoteSourceOptions.includes(configuredDestination)
				? configuredDestination
				: 'custom',
			customDestination: configuredDestination
		};
		manifestDestination = configuredDestination;
		resetManifestCorrection(manifestText, configuredDestination);
		resetManifestEditMode(manifestText);
	}

	function updateManifestText(manifestText: string, preserveFixChoices = false) {
		draft.manifestText = manifestText;
		manifestModeError = '';
		resetManifestCorrection(manifestText, requestedDestination, preserveFixChoices);
	}

	function updateManifestConfig(nextConfig: Record<string, unknown>) {
		if (!manifestConfig) return;
		const nextText = updatePackageConfigText(draft.manifestText, manifestConfig, nextConfig);
		updateManifestText(nextText, true);
	}

	function setManifestEditMode(nextMode: ManifestEditMode) {
		if (nextMode === 'manual') {
			manifestEditMode = 'manual';
			manifestModeError = '';
			return;
		}

		if (!parseManifestObject(draft.manifestText)) {
			manifestEditMode = 'manual';
			manifestModeError = 'Control mode requires a valid JSON object manifest.';
			return;
		}

		manifestEditMode = 'controls';
		manifestModeError = '';
	}

	function resetManifestChanges() {
		draft.manifestText = draft.manifestTextInitial;
		draft.destinationChoice = remoteSourceOptions.includes(manifestDestination)
			? manifestDestination
			: 'custom';
		draft.customDestination = manifestDestination;
		includeHpmMetadata = false;
		hpmMetadataChanged = false;
		resetManifestCorrection(draft.manifestTextInitial, requestedDestination);
		resetManifestEditMode(draft.manifestTextInitial);
		manifestFixState.applyPathAliasLocationFix = false;
		manifestFixState.migrateLegacyPath = false;
	}

	function resetManifestCorrection(
		manifestText: string,
		defaultHpath: string,
		preserveFixChoices = false
	) {
		const parsedConfig = parseManifestObject(manifestText);
		const previousState = preserveFixChoices ? manifestFixState : null;
		manifestConfig = parsedConfig;
		manifestFixState = createConfigFixState(parsedConfig ?? {}, {
			defaultHpath,
			...manifestCorrectionContext(draft.packageFile)
		});
		if (!previousState) return;
		manifestFixState.applySourcePathFix =
			previousState.applySourcePathFix && manifestFixState.sourcePathFixCandidates.length > 0;
		manifestFixState.sourcePathFixPath = manifestFixState.sourcePathFixCandidates.includes(
			previousState.sourcePathFixPath
		)
			? previousState.sourcePathFixPath
			: (manifestFixState.sourcePathFixCandidates[0] ?? '');
		manifestFixState.applyPathAliasFix =
			previousState.applyPathAliasFix && Boolean(manifestFixState.pathAliasConflict);
		manifestFixState.applyPathAliasLocationFix =
			previousState.applyPathAliasLocationFix && Boolean(manifestFixState.pathAliasLocationIssue);
		manifestFixState.migrateLegacyPath =
			previousState.migrateLegacyPath &&
			Object.prototype.hasOwnProperty.call(parsedConfig ?? {}, 'path');
		manifestFixState.legacyPathAlias = previousState.legacyPathAlias;
		manifestFixState.pathAliasResolution = previousState.pathAliasResolution;
	}

	function resetManifestEditMode(manifestText: string) {
		manifestEditMode = parseManifestObject(manifestText) ? 'controls' : 'manual';
		manifestModeError = '';
	}

	function parseManifestObject(manifestText: string): Record<string, unknown> | null {
		if (!manifestText.trim()) return null;
		try {
			const parsed = JSON.parse(manifestText) as unknown;
			return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
				? (parsed as Record<string, unknown>)
				: null;
		} catch {
			return null;
		}
	}

	function manifestCorrectionContext(packageFile: string) {
		const relevantTargets: ActivationTarget[] = targets.filter(
			(target: ActivationTarget) =>
				target.pluginId === plugin.id && target.packageFile === packageFile
		);
		const pathAliasConflict = relevantTargets.find(
			(target: ActivationTarget) => target.pathAliasConflict
		)?.pathAliasConflict;
		const pathAliasLocationIssue = relevantTargets.find(
			(target: ActivationTarget) => target.pathAliasLocationIssue
		)?.pathAliasLocationIssue;
		const undefinedVariableReferences = [
			...new Set(
				relevantTargets.flatMap(
					(target: ActivationTarget) => target.undefinedVariableReferences ?? []
				)
			)
		];

		return {
			pathAliasConflict,
			pathAliasLocationIssue,
			undefinedVariableReferences,
			migrateLegacyPath:
				relevantTargets.some((target: ActivationTarget) => target.usesLegacyPath) || undefined
		};
	}

	function toggleNonTaggedCommits(checked: boolean) {
		showNonTaggedCommits = checked;
		if (
			!checked &&
			versions.find((version: InstallVersionOption) => version.value === draft.version)?.kind ===
				'commit'
		) {
			draft.version =
				versions.find((version: InstallVersionOption) => version.kind === 'tag')?.value ?? '';
		}
	}

	function selectVersion(version: string) {
		draft.version = version;
	}

	function closeDialog() {
		if (installState === 'working') return;
		onClose();
	}

	function cancelInstallation() {
		if (installState !== 'working') return;
		onCancel();
	}

	function toggleInstallTarget(installId: string, checked: boolean) {
		draft.selectedInstallIds = checked
			? [...new Set([...draft.selectedInstallIds, installId])]
			: draft.selectedInstallIds.filter((id) => id !== installId);
	}

	function setAllInstallTargets(selected: boolean) {
		draft.selectedInstallIds = selected
			? installs.map((install: HoudiniInstall) => install.id)
			: [];
	}

	function activateCustomDestination() {
		draft.destinationChoice = 'custom';
	}

	function resetCustomDestination() {
		draft.destinationChoice = 'custom';
		draft.customDestination = manifestDestination;
	}

	function targetForInstall(installId: string) {
		return targets.find(
			(target: ActivationTarget) => target.pluginId === plugin.id && target.installId === installId
		);
	}

	function currentVersionLabel(installId: string) {
		const target = targetForInstall(installId);
		if (!target || target.status === 'missing') return 'Not installed';
		return target.artifactVersion ?? 'Installed, version unknown';
	}

	function isSameVersion(installId: string) {
		const currentVersion = targetForInstall(installId)?.artifactVersion;
		return Boolean(
			currentVersion &&
			requestedVersion &&
			compareVersionLabels(currentVersion, requestedVersion) === 0
		);
	}

	function submitInstall() {
		if (!canInstall) return;

		const installIds = installs
			.filter((install: HoudiniInstall) => draft.selectedInstallIds.includes(install.id))
			.map((install: HoudiniInstall) => install.id);
		const correctedText =
			manifestEditMode === 'controls' && manifestConfig ? manifestPreviewText : draft.manifestText;
		const hasCorrectedManifest =
			draft.manifestText !== draft.manifestTextInitial ||
			(manifestEditMode === 'controls' &&
				Boolean(manifestConfig && correctedText !== draft.manifestText));
		const selection: InstallDialogSelection = {
			packageFile: draft.packageFile,
			version: requestedVersion,
			installIds,
			destinationPath: requestedDestination,
			includeHpmMetadata,
			generatedConfigText: installPreviewText,
			...(hasCorrectedManifest ? { correctedConfigText: correctedText } : {})
		};
		const options: InstallDialogOptions = {
			openInstalledFolder: draft.openInstalledFolder,
			openInstalledConfig: draft.openInstalledConfig
		};

		void onInstall(selection, options);
	}

	function shortSha(value: string) {
		return value.slice(0, 7);
	}

	function versionDisplayLabel(value: string) {
		return visibleVersions.find((version: InstallVersionOption) => version.value === value)
			?.kind === 'commit'
			? shortSha(value)
			: value;
	}
</script>

<div
	class:issues-dialog-backdrop={presentation === 'dialog'}
	class:install-page-shell={presentation === 'page'}
	class="install-dialog-root"
>
	{#if presentation === 'dialog'}
		<button
			type="button"
			class="issues-dialog-dismiss"
			aria-label="Close install configuration dialog"
			disabled={installState === 'working'}
			onclick={closeDialog}
		></button>
	{/if}
	<dialog
		open
		class="issues-dialog install-dialog"
		class:install-page-dialog={presentation === 'page'}
		aria-labelledby="install-dialog-title"
		aria-describedby="install-dialog-description"
		aria-busy={installState === 'working'}
	>
		<div class="issues-dialog-header">
			<div class="install-dialog-title-row">
				{#if plugin.repositoryUrl}
					<a
						class="install-dialog-github-link"
						href={plugin.repositoryUrl}
						target="_blank"
						rel="external noopener noreferrer"
						aria-label={`Open ${plugin.name} on GitHub`}
					>
						<GithubLogo size={18} aria-hidden="true" />
					</a>
				{/if}
				<h2 id="install-dialog-title">Install {plugin.name}</h2>
			</div>
			<div class="install-dialog-header-controls">
				<div class="install-dialog-actions">
					{#if installState === 'working'}
						<button type="button" class="dialog-secondary-button" onclick={cancelInstallation}>
							Cancel installation
						</button>
					{:else if presentation === 'dialog'}
						<button type="button" class="dialog-secondary-button" onclick={closeDialog}
							>Close</button
						>
					{/if}
					<button
						type="button"
						class="dialog-primary-button"
						disabled={!canInstall}
						onclick={submitInstall}
					>
						Install plugin
					</button>
				</div>
			</div>
		</div>
		<div class="install-dialog-layout">
			<aside class="version-panel" aria-labelledby="install-version-label">
				<div class="version-panel-heading">
					<div>
						<span class="install-dialog-kicker">Version</span>
						<strong id="install-version-label"
							>{selectedVersion?.label ?? selectedVersion?.value ?? 'Choose a version'}</strong
						>
					</div>
					{#if selectedVersion?.isLatest}<span class="version-latest-marker">Latest</span>{/if}
				</div>
				<label class="version-filter">
					<span>Filter versions</span>
					<input
						type="search"
						aria-label="Filter available versions"
						placeholder="Search labels or values"
						bind:value={versionQuery}
						disabled={installState === 'working'}
					/>
				</label>
				<div
					id="install-version-options"
					class="version-select-menu"
					role="listbox"
					aria-label="Available versions"
				>
					{#if filteredVersions.length === 0}
						<p class="version-filter-empty">No versions match this filter.</p>
					{:else}
						{#each filteredVersions as version (version.value)}
							<button
								type="button"
								class="version-select-option"
								class:is-selected={version.value === requestedVersion}
								role="option"
								aria-selected={version.value === requestedVersion}
								disabled={installState === 'working'}
								onclick={() => selectVersion(version.value)}
							>
								{#if version.kind === 'tag'}
									<Tag size={14} strokeWidth={1.8} aria-hidden="true" />
								{/if}
								<span>{version.label ?? version.value}</span>
								{#if version.isLatest}<span class="version-latest-marker">Latest</span>{/if}
							</button>
						{/each}
					{/if}
				</div>
				<label class="install-version-toggle">
					<input
						type="checkbox"
						checked={showNonTaggedCommits}
						disabled={installState === 'working'}
						onchange={(event) =>
							toggleNonTaggedCommits((event.currentTarget as HTMLInputElement).checked)}
					/>
					<span>
						<strong>Show non-tagged commits</strong>
					</span>
				</label>
			</aside>

			<div class="install-dialog-column install-manifest-column">
				{#if packageFiles.length > 0}
					<section class="install-package-chooser" aria-labelledby="install-package-file-title">
						<strong id="install-package-file-title">Package file</strong>
						<div class="install-package-chooser-row">
							<label class="install-manifest-select">
								<select
									aria-label="Houdini package manifest"
									value={draft.packageFile}
									disabled={installState === 'working' || manifestEditMode === 'manual'}
									onchange={(event) =>
										selectPackageFile((event.currentTarget as HTMLSelectElement).value)}
								>
									{#each packageFiles as packageFile (packageFile)}
										<option value={packageFile}>{packageFile}</option>
									{/each}
								</select>
							</label>
							<section
								class="install-manifest-mode-section"
								aria-labelledby="install-manifest-mode-title"
							>
								<div class="install-manifest-mode-switch">
									<div
										class="install-manifest-mode-options"
										role="radiogroup"
										aria-label="Manifest edit mode"
									>
										<label
											class="install-manifest-mode-option"
											class:is-selected={manifestEditMode === 'controls'}
										>
											<span
												class="install-manifest-control-rail install-manifest-control-rail-radio"
											>
												<input
													type="radio"
													name="install-manifest-edit-mode"
													value="controls"
													checked={manifestEditMode === 'controls'}
													disabled={installState === 'working'}
													onchange={() => setManifestEditMode('controls')}
												/>
												<span class="install-manifest-control-rail-mark" aria-hidden="true"></span>
											</span>
											<span>Control mode</span>
										</label>
										<label
											class="install-manifest-mode-option"
											class:is-selected={manifestEditMode === 'manual'}
										>
											<span
												class="install-manifest-control-rail install-manifest-control-rail-radio"
											>
												<input
													type="radio"
													name="install-manifest-edit-mode"
													value="manual"
													checked={manifestEditMode === 'manual'}
													disabled={installState === 'working'}
													onchange={() => setManifestEditMode('manual')}
												/>
												<span class="install-manifest-control-rail-mark" aria-hidden="true"></span>
											</span>
											<span>Manual edit</span>
										</label>
									</div>
								</div>
								{#if manifestModeError}
									<p class="install-manifest-mode-error" role="alert">{manifestModeError}</p>
								{/if}
							</section>
						</div>
					</section>
				{/if}
				{#if packageFiles.length > 0}
					<ConfigFixesPanel
						bind:state={manifestFixState}
						disabled={installState === 'working' || manifestEditMode === 'manual'}
						fixesDisabled={installState === 'working' || manifestEditMode === 'manual'}
						idPrefix="install-manifest"
						layout="table"
						manifestIssues={selectedManifestPreflight?.issues ?? []}
						manifestFatal={selectedManifestPreflight?.fatal ?? false}
						manifestUninspected={!selectedManifestPreflight}
						{manifestDraftError}
						highlightedControllerId={hoveredConfigController}
						onControllerHover={(controllerId) => (hoveredConfigController = controllerId)}
					/>
				{:else}
					<p class="install-manifest-empty">No package manifest is available.</p>
				{/if}
				<fieldset class="install-dialog-fieldset">
					<legend>Package manifest</legend>
					{#if packageFiles.length === 0}
						<p class="install-manifest-empty" role="alert">
							No JSON package files were found in this repository. Installation is unavailable.
						</p>
					{:else}
						<section
							class="install-hpm-metadata-section"
							aria-labelledby="install-hpm-metadata-title"
						>
							<div>
								<strong id="install-hpm-metadata-title">Apply HPM Metadata</strong>
								<p>
									Adds repository and version details so HPM can identify and track this plugin.
								</p>
							</div>
							<label class="install-hpm-metadata-toggle">
								<span class="install-manifest-control-rail">
									<input
										type="checkbox"
										checked={includeHpmMetadata}
										disabled={installState === 'working' || manifestEditMode === 'manual'}
										onchange={(event) => {
											includeHpmMetadata = (event.currentTarget as HTMLInputElement).checked;
											hpmMetadataChanged = includeHpmMetadata !== true;
										}}
									/>
									<span class="install-manifest-control-rail-mark" aria-hidden="true"></span>
								</span>
								<span>Append HPM metadata</span>
							</label>
						</section>
						<section
							class="install-manifest-destination-section"
							class:is-controller-highlighted={hoveredConfigController === 'plugin-destination'}
							aria-labelledby="install-manifest-destination-title"
						>
							<div class="install-manifest-subsection-heading">
								<strong id="install-manifest-destination-title">Plugin destination</strong>
								<p>Git will clone or update the remote source at this exact folder.</p>
							</div>
							{#each remoteSourceOptions as sourcePath (sourcePath)}
								<label class="install-destination-card">
									<span class="install-manifest-control-rail install-manifest-control-rail-radio">
										<input
											class="install-destination-radio"
											type="radio"
											name="install-destination"
											checked={draft.destinationChoice === sourcePath}
											disabled={installState === 'working' || manifestEditMode === 'manual'}
											onchange={() => (draft.destinationChoice = sourcePath)}
										/>
										<span class="install-manifest-control-rail-mark" aria-hidden="true"></span>
									</span>
									<span class="install-destination-content">
										<strong
											>{sourcePath === hpmPluginDestination ? 'HPM' : 'Discovered source'}</strong
										>
										<small>{sourcePath}</small>
									</span>
								</label>
							{/each}
							<label class="install-destination-card">
								<span class="install-manifest-control-rail install-manifest-control-rail-radio">
									<input
										class="install-destination-radio"
										type="radio"
										name="install-destination"
										checked={draft.destinationChoice === 'custom'}
										disabled={installState === 'working' || manifestEditMode === 'manual'}
										onchange={() => (draft.destinationChoice = 'custom')}
									/>
									<span class="install-manifest-control-rail-mark" aria-hidden="true"></span>
								</span>
								<span class="install-destination-content">
									<strong>Custom folder</strong>
									<div class="install-destination-custom-control">
										<input
											class="install-destination-input"
											type="text"
											aria-label="Custom plugin destination"
											value={draft.customDestination}
											placeholder={`C:\\Plugins\\${plugin.name}`}
											readonly={draft.destinationChoice !== 'custom'}
											disabled={installState === 'working' || manifestEditMode === 'manual'}
											onclick={activateCustomDestination}
											onfocus={activateCustomDestination}
											oninput={(event) =>
												(draft.customDestination = (event.currentTarget as HTMLInputElement).value)}
										/>
										<button
											type="button"
											class="install-destination-reset"
											title="Reset custom destination"
											aria-label="Reset custom destination"
											disabled={!customDestinationChanged || manifestEditMode === 'manual'}
											onclick={resetCustomDestination}
										>
											<RotateCcw size={13} strokeWidth={1.9} aria-hidden="true" />
										</button>
									</div>
								</span>
							</label>
						</section>
						{#if manifestEditMode === 'controls' && manifestConfig}
							<PackageConfigControls
								config={manifestConfig}
								disabled={installState === 'working'}
								onChange={updateManifestConfig}
							/>
						{/if}
					{/if}
				</fieldset>
			</div>

			<div class="install-dialog-column install-preview-column">
				<fieldset class="install-dialog-fieldset">
					<legend>Config text</legend>
					{#if packageFiles.length > 0}
						<ConfigPreviewPanel
							originalText={draft.manifestTextInitial}
							previewText={installPreviewText}
							{evaluatedVariables}
							editable={manifestEditMode === 'manual'}
							fillHeight
							resetAvailable={hpmMetadataChanged}
							lockedRanges={manifestEditMode === 'controls' ? destinationLockedRanges : []}
							locked={manifestEditMode === 'controls' &&
								(manifestFixState.applyPathAliasFix ||
									manifestFixState.applyPathAliasLocationFix ||
									manifestFixState.migrateLegacyPath)}
							onReset={resetManifestChanges}
							disabled={installState === 'working'}
							onLockedRangeHover={(range) =>
								(hoveredConfigController = range?.controllerId ?? null)}
							onEdit={manifestEditMode === 'manual' ? updateManifestText : undefined}
						/>
					{:else}
						<p class="install-manifest-empty">No package manifest is available.</p>
					{/if}
				</fieldset>
			</div>

			<div class="install-dialog-column install-review-column">
				<fieldset class="install-dialog-fieldset">
					<legend class="install-fieldset-heading">
						<span>Houdini installs</span>
						<span class="install-selection-actions">
							<button
								type="button"
								class="selection-link"
								disabled={installState === 'working'}
								onclick={() => setAllInstallTargets(true)}>All</button
							>
							<button
								type="button"
								class="selection-link"
								disabled={installState === 'working'}
								onclick={() => setAllInstallTargets(false)}>Clear</button
							>
						</span>
					</legend>
					<p class="install-selection-summary">
						{selectedInstallCount} of {installs.length} Houdini installs
					</p>
					<div class="install-target-options">
						{#each installs as install (install.id)}
							<label
								class={[
									'install-target-option',
									draft.selectedInstallIds.includes(install.id) ? 'is-selected' : ''
								]}
							>
								<span class="install-target-toggle">
									<input
										type="checkbox"
										checked={draft.selectedInstallIds.includes(install.id)}
										disabled={installState === 'working'}
										onchange={(event) =>
											toggleInstallTarget(
												install.id,
												(event.currentTarget as HTMLInputElement).checked
											)}
									/>
									<span class="install-target-toggle-mark" aria-hidden="true"></span>
								</span>
								<span>
									<strong class="install-target-version">
										<img src={houdiniBadge} alt="" width={14} aria-hidden="true" />
										<span>Houdini {install.version}</span>
										<span class="build-badge" data-tooltip="Build">{install.build}</span>
									</strong>
									<span class="install-version-change">
										<span class="install-version-current">{currentVersionLabel(install.id)}</span>
										{#if draft.selectedInstallIds.includes(install.id)}
											<span class="install-version-arrow" aria-hidden="true">→</span>
											<span class="install-version-next">
												{requestedVersion
													? versionDisplayLabel(requestedVersion)
													: 'Choose a version'}
											</span>
											{#if isSameVersion(install.id)}
												<TriangleAlert
													size={18}
													strokeWidth={2}
													class="install-version-warning"
													aria-label="Selected version is already installed"
													data-tooltip="Selected version is already installed"
												/>
											{/if}
										{/if}
									</span>
								</span>
							</label>
						{/each}
					</div>
				</fieldset>

				<fieldset class="install-dialog-fieldset">
					<legend>After install</legend>
					<p>Choose which installed plugin locations to open when setup finishes.</p>
					<label class="install-open-folder-option">
						<input
							type="checkbox"
							bind:checked={draft.openInstalledFolder}
							disabled={installState === 'working'}
						/>
						<span>
							<strong>Open plugin folder</strong>
						</span>
					</label>
					<label class="install-open-folder-option">
						<input
							type="checkbox"
							bind:checked={draft.openInstalledConfig}
							disabled={installState === 'working'}
						/>
						<span>
							<strong>Open plugin config</strong>
						</span>
					</label>
				</fieldset>

				{#if plugin.provenanceSource === 'catalog' && plugin.pinnedCommit && plugin.manifestBlobSha}
					<div class="install-provenance curated-provenance" role="note">
						<div class="install-provenance-heading">
							<ShieldCheck size={17} strokeWidth={1.8} aria-hidden="true" />
							<strong>Curated provenance</strong>
						</div>
						<div class="install-provenance-grid">
							<div>
								<span>Selected ref</span>
								<code>{selectedVersion?.value ?? 'Choose a ref'}</code>
							</div>
							<div>
								<span
									><GitCommitHorizontal size={14} strokeWidth={1.8} aria-hidden="true" /> Approved commit</span
								>
								<code title={plugin.pinnedCommit}>{shortSha(plugin.pinnedCommit)}</code>
							</div>
							<div>
								<span
									><FileCheck2 size={14} strokeWidth={1.8} aria-hidden="true" /> Manifest file</span
								>
								<code>{plugin.packageFile ?? 'package manifest'}</code>
							</div>
							<div>
								<span>Approved blob SHA</span>
								<code title={plugin.manifestBlobSha}>{shortSha(plugin.manifestBlobSha)}</code>
							</div>
						</div>
						<p>
							The selected ref is checked against approved provenance. A tag that differs from the
							curated pin may still be installed, but it will be marked unverified.
						</p>
					</div>
				{:else if plugin.provenanceSource === 'github'}
					<div class="install-provenance repository-provenance" role="note">
						<div class="install-provenance-heading">
							<GitCommitHorizontal size={17} strokeWidth={1.8} aria-hidden="true" />
							<strong>Repository provenance</strong>
						</div>
						<p>
							The checked-out commit and manifest hash will be recorded after checkout. This
							repository is not pre-approved by the curated catalog.
						</p>
					</div>
				{/if}
				{#if message}
					<p class={['install-message', `is-${installState}`]} aria-live="polite">{message}</p>
				{/if}
			</div>
		</div>
	</dialog>
</div>

<style>
	.issues-dialog-backdrop {
		position: fixed;
		inset: 0;
		z-index: 9000;
		display: grid;
		place-items: center;
		padding: 24px;
		background: rgba(9, 14, 15, 0.72);
	}

	.install-page-shell {
		display: flex;
		min-height: 0;
		height: 100%;
		width: 100%;
	}

	.install-page-shell .install-page-dialog {
		position: static;
		width: 100%;
		height: 100%;
		max-height: none;
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		box-shadow: none;
		overflow: visible;
	}

	.issues-dialog-dismiss {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
		background: transparent;
		cursor: default;
	}

	.issues-dialog {
		position: relative;
		z-index: 1;
		display: flex;
		width: min(640px, 100%);
		height: min(820px, calc(100dvh - 48px));
		flex-direction: column;
		overflow: hidden;
		padding: 22px;
		border: 1px solid var(--line-strong);
		border-radius: 8px;
		background: #182224;
		box-shadow: 0 22px 70px rgba(0, 0, 0, 0.42);
	}

	.issues-dialog-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 20px;
	}

	.install-dialog-header-controls {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin-left: auto;
	}

	.issues-dialog-header h2 {
		margin: 0;
		font-size: 22px;
		font-weight: 600;
	}

	.install-dialog-title-row {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 9px;
	}

	.install-dialog-github-link {
		display: inline-flex;
		width: 30px;
		height: 30px;
		align-items: center;
		justify-content: center;
		flex: 0 0 auto;
		border: 1px solid var(--line);
		border-radius: 5px;
		color: var(--text-muted);
	}

	.install-dialog-github-link:hover,
	.install-dialog-github-link:focus-visible {
		border-color: #399b82;
		color: #b8ded2;
		outline: none;
	}

	.dialog-close-button {
		display: inline-flex;
		width: 34px;
		height: 34px;
		align-items: center;
		justify-content: center;
		flex: 0 0 auto;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
	}

	.dialog-close-button:hover,
	.dialog-close-button:focus-visible {
		border-color: #df6d58;
		color: #ffb09f;
		outline: none;
	}

	.install-dialog {
		width: 100%;
		height: 100%;
	}

	.install-dialog-layout {
		display: grid;
		grid-template-columns:
			minmax(180px, 0.3fr)
			minmax(360px, 1.2fr)
			minmax(300px, 0.9fr)
			minmax(280px, 0.75fr);
		min-height: 0;
		flex: 1 1 auto;
		gap: 8px;
		margin-top: 20px;
	}

	.version-panel {
		display: flex;
		min-height: 0;
		height: 100%;
		flex-direction: column;
		overflow: hidden;
		padding: 13px;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.02);
	}

	.version-panel-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
		padding: 2px 2px 10px;
		border-bottom: 1px solid var(--line);
	}

	.version-panel-heading > div {
		display: grid;
		min-width: 0;
		gap: 3px;
	}

	.install-dialog-kicker {
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 11px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.version-panel-heading strong {
		min-width: 0;
		overflow-wrap: anywhere;
		font-size: 14px;
		font-weight: 650;
	}

	.version-filter {
		display: grid;
		gap: 5px;
		margin-top: 10px;
		color: var(--text-dim);
		font-size: 11px;
	}

	.version-filter input {
		box-sizing: border-box;
		width: 100%;
		min-width: 0;
		padding: 8px 9px;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: var(--surface-raised);
		color: var(--text);
		font: inherit;
		font-size: 12px;
	}

	.version-filter input:focus-visible {
		border-color: #399b82;
		outline: 2px solid rgba(57, 155, 130, 0.3);
		outline-offset: 1px;
	}

	.version-filter-empty {
		margin: 6px 4px;
		color: var(--text-muted);
		font-size: 12px;
	}

	.version-panel .version-select-menu {
		display: grid;
		min-height: 0;
		flex: 1 1 auto;
		align-content: start;
		grid-auto-rows: max-content;
		margin: 10px -4px 12px;
		padding: 4px;
		overflow-y: auto;
	}

	.version-panel .install-version-toggle {
		margin-top: auto;
		padding-top: 10px;
		border-top: 1px solid var(--line);
	}

	.install-dialog-column {
		display: flex;
		min-height: 0;
		flex: 1 1 auto;
		flex-direction: column;
		gap: 14px;
		margin-top: 0;
		overflow-y: auto;
		padding-right: 2px;
	}

	.install-manifest-column,
	.install-preview-column,
	.install-review-column {
		min-width: 0;
	}

	.install-manifest-column {
		height: 100%;
		overflow-y: auto;
	}

	.install-preview-column {
		height: 100%;
		overflow: hidden;
	}

	.install-manifest-column > .install-dialog-fieldset {
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		flex: 0 0 auto;
		min-height: 0;
		overflow: visible;
	}

	.install-preview-column > .install-dialog-fieldset {
		display: flex;
		height: 100%;
		min-height: 0;
		flex-direction: column;
	}

	.version-select-option {
		display: flex;
		align-items: center;
		gap: 7px;
	}

	.version-select-option {
		width: 100%;
		padding: 4px 7px;
		border: 0;
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: 12px;
		text-align: left;
		cursor: pointer;
		border-radius: 4px;
	}

	.version-latest-marker {
		padding: 2px 5px;
		border: 1px solid rgba(211, 155, 56, 0.4);
		border-radius: 3px;
		background: rgba(211, 155, 56, 0.1);
		color: #e2b95f;
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 12px;
		font-weight: 600;
		line-height: 1;
		text-transform: uppercase;
	}

	.version-select-option:hover,
	.version-select-option:focus-visible,
	.version-select-option.is-selected {
		background: rgba(57, 155, 130, 0.14);
		outline: none;
	}

	.install-version-toggle {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin-top: 8px;
		color: var(--text-muted);
		cursor: pointer;
	}

	.install-version-toggle input {
		accent-color: #399b82;
		flex: 0 0 auto;
		margin: 2px 0 0;
	}

	.install-version-toggle span {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.install-version-toggle strong {
		color: var(--text);
		font-size: 12px;
		font-weight: 600;
	}

	.install-dialog-fieldset {
		min-width: 0;
		margin: 0;
		padding: 0 12px 12px 12px;
		border: 1px solid var(--line);
		border-radius: 5px;
	}

	.install-dialog-fieldset.is-controller-highlighted {
		border-color: rgba(239, 190, 83, 0.85);
		box-shadow: 0 0 0 2px rgba(211, 155, 56, 0.16);
	}

	.install-dialog-fieldset legend {
		padding: 0 5px;
		color: var(--text);
		font-size: 12px;
		font-weight: 600;
	}

	.install-manifest-column {
		color: var(--text);
		font-size: 12px;
		line-height: 1.4;
	}

	.install-package-chooser {
		display: grid;
		gap: 7px;
		padding: 2px 0;
	}

	.install-package-chooser > strong {
		color: var(--text);
		font-size: 12px;
		font-weight: 600;
	}

	.install-package-chooser-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 8px;
	}

	.install-manifest-column
		:is(.install-manifest-mode-option, .install-hpm-metadata-section, .install-destination-card) {
		border: 1px solid var(--line);
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.02);
	}

	.install-manifest-mode-section {
		display: grid;
		gap: 8px;
		min-width: 0;
	}

	.install-manifest-subsection-heading strong,
	.install-hpm-metadata-section strong,
	.install-destination-content strong {
		font-size: 12px;
		font-weight: 600;
	}

	.install-manifest-mode-switch {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 0;
	}

	.install-manifest-mode-options {
		display: inline-flex;
		flex-wrap: wrap;
		justify-content: flex-start;
		gap: 4px;
	}

	.install-manifest-mode-option {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 6px 9px;
		color: var(--text-muted);
		font-size: 12px;
		cursor: pointer;
	}

	.install-manifest-control-rail {
		position: relative;
		display: flex;
		align-self: stretch;
		width: 22px;
		min-height: 28px;
		flex: 0 0 22px;
		align-items: stretch;
	}

	.install-manifest-control-rail input {
		position: absolute;
		inset: 0;
		z-index: 1;
		width: 100%;
		height: 100%;
		margin: 0;
		cursor: pointer;
		opacity: 0;
	}

	.install-manifest-control-rail-mark {
		position: relative;
		display: block;
		width: 100%;
		min-height: 28px;
		box-sizing: border-box;
		border: 1px solid var(--line-strong);
		border-radius: 4px;
		background: rgba(8, 14, 16, 0.5);
		transition:
			background 140ms ease,
			border-color 140ms ease;
	}

	.install-manifest-control-rail-radio .install-manifest-control-rail-mark {
		align-self: center;
		width: 18px;
		height: 18px;
		min-height: 18px;
		border-radius: 50%;
	}

	.install-manifest-control-rail-mark::after {
		position: absolute;
		top: 50%;
		left: 50%;
		content: '';
		opacity: 0;
		transition: opacity 140ms ease;
	}

	.install-manifest-control-rail:not(.install-manifest-control-rail-radio)
		.install-manifest-control-rail-mark::after {
		width: 6px;
		height: 11px;
		border: solid #f2fff9;
		border-width: 0 2px 2px 0;
		transform: translate(-50%, -58%) rotate(45deg);
	}

	.install-manifest-control-rail-radio .install-manifest-control-rail-mark::after {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #f2fff9;
		transform: translate(-50%, -50%);
	}

	.install-manifest-control-rail input:checked + .install-manifest-control-rail-mark {
		border-color: #3d9b7c;
		background: #2e8065;
	}

	.install-manifest-control-rail input:checked + .install-manifest-control-rail-mark::after {
		opacity: 1;
	}

	.install-manifest-control-rail input:focus-visible + .install-manifest-control-rail-mark {
		outline: 3px solid rgba(59, 155, 130, 0.26);
		outline-offset: 1px;
	}

	.install-manifest-control-rail input:disabled + .install-manifest-control-rail-mark {
		cursor: wait;
		opacity: 0.5;
	}

	.install-manifest-mode-option.is-selected {
		border-color: rgba(57, 155, 130, 0.55);
		background: rgba(57, 155, 130, 0.12);
		color: var(--text);
	}

	.install-manifest-mode-option:focus-within {
		outline: 2px solid rgba(57, 155, 130, 0.3);
		outline-offset: 1px;
	}

	.install-manifest-mode-option input {
		accent-color: #399b82;
		margin: 0;
	}

	.install-manifest-mode-error {
		margin: 0;
		color: #df6d58;
		line-height: 1.4;
	}

	.install-fieldset-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.install-fieldset-heading > span:first-child {
		padding: 0;
	}

	.install-selection-actions {
		display: flex;
		flex: 0 0 auto;
		gap: 8px;
	}

	.selection-link {
		padding: 2px 0;
		border: 0;
		background: transparent;
		color: #55c4a5;
		cursor: pointer;
		font: inherit;
		font-size: 12px;
	}

	.selection-link:hover:not(:disabled),
	.selection-link:focus-visible:not(:disabled) {
		color: var(--text);
		outline: none;
		text-decoration: underline;
	}

	.selection-link:disabled {
		cursor: wait;
		opacity: 0.5;
	}

	.install-manifest-column
		:is(
			.install-hpm-metadata-section p,
			.install-manifest-subsection-heading p,
			.install-destination-card small
		) {
		color: var(--text-muted);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 12px;
		line-height: 1.4;
	}

	.install-hpm-metadata-section {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		margin-top: 8px;
		padding: 10px;
	}

	.install-hpm-metadata-section > div {
		display: grid;
		min-width: 0;
		gap: 3px;
	}

	.install-hpm-metadata-section p {
		margin: 0;
	}

	.install-hpm-metadata-toggle {
		display: inline-flex;
		align-items: center;
		flex: 0 0 auto;
		gap: 6px;
		color: var(--text-muted);
		font-size: 12px;
		cursor: pointer;
	}

	.install-manifest-destination-section {
		margin-top: 14px;
		padding-top: 12px;
		border-top: 1px solid var(--line);
	}

	.install-manifest-destination-section.is-controller-highlighted {
		border-top-color: rgba(239, 190, 83, 0.85);
	}

	.install-manifest-subsection-heading {
		display: grid;
		gap: 3px;
		margin-bottom: 8px;
	}

	.install-manifest-subsection-heading p {
		margin: 0;
	}

	.install-manifest-select {
		display: grid;
		gap: 6px;
		min-width: 0;
		color: var(--text-muted);
		font-size: 12px;
	}

	.install-manifest-select select,
	.install-destination-input {
		box-sizing: border-box;
		width: 100%;
		min-width: 0;
		padding: 8px 9px;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: var(--surface-raised);
		color: var(--text);
		font: inherit;
		font-size: 12px;
	}

	.install-manifest-select select:focus-visible,
	.install-destination-input:focus-visible {
		border-color: #399b82;
		outline: 2px solid rgba(57, 155, 130, 0.3);
		outline-offset: 1px;
	}

	.install-manifest-empty {
		margin: 8px 0 0;
		color: var(--text-muted);
		font-size: 12px;
		line-height: 1.4;
	}

	.install-target-options {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
		margin-top: 12px;
	}

	.install-target-option,
	.install-open-folder-option {
		display: flex;
		min-width: 0;
		align-items: flex-start;
		gap: 9px;
		padding: 9px;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.02);
		cursor: pointer;
	}

	.install-target-option:hover,
	.install-open-folder-option:hover {
		border-color: var(--line-strong);
		background: rgba(255, 255, 255, 0.04);
	}

	.install-target-option.is-selected {
		border-color: rgba(57, 155, 130, 0.5);
		background: rgba(57, 155, 130, 0.08);
	}

	.install-target-option input,
	.install-open-folder-option input {
		accent-color: #399b82;
		flex: 0 0 auto;
		margin: 2px 0 0;
	}

	.install-target-toggle {
		position: relative;
		display: flex !important;
		align-self: stretch;
		width: 22px;
		min-height: 42px;
		flex: 0 0 22px;
		flex-direction: row !important;
		gap: 0 !important;
	}

	.install-target-toggle input {
		position: absolute;
		inset: 0;
		z-index: 1;
		width: 100%;
		height: 100%;
		margin: 0;
		cursor: pointer;
		opacity: 0;
	}

	.install-target-toggle-mark {
		position: relative;
		display: block !important;
		width: 100%;
		height: 100%;
		min-height: 42px;
		box-sizing: border-box;
		border: 1px solid var(--line-strong);
		border-radius: 4px;
		background: rgba(8, 14, 16, 0.5);
		transition:
			background 140ms ease,
			border-color 140ms ease;
	}

	.install-target-toggle-mark::after {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 6px;
		height: 11px;
		border: solid #f2fff9;
		border-width: 0 2px 2px 0;
		content: '';
		opacity: 0;
		transform: translate(-50%, -58%) rotate(45deg);
		transition: opacity 140ms ease;
	}

	.install-target-toggle input:checked + .install-target-toggle-mark {
		border-color: #3d9b7c;
		background: #2e8065;
	}

	.install-target-toggle input:checked + .install-target-toggle-mark::after {
		opacity: 1;
	}

	.install-target-toggle input:focus-visible + .install-target-toggle-mark {
		outline: 3px solid rgba(59, 155, 130, 0.26);
		outline-offset: 1px;
	}

	.install-target-toggle input:disabled + .install-target-toggle-mark {
		cursor: wait;
		opacity: 0.5;
	}

	.install-target-option span,
	.install-open-folder-option span {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 3px;
	}

	.install-target-option strong,
	.install-open-folder-option strong {
		font-size: 12px;
		font-weight: 600;
	}

	.install-target-version {
		display: flex !important;
		align-items: center;
		gap: 7px;
	}

	.install-target-version :global(svg) {
		flex: 0 0 auto;
		color: #84c9ae;
	}

	.install-target-version > span {
		display: inline !important;
		flex: 0 0 auto;
		flex-direction: initial !important;
	}

	.build-badge {
		padding: 2px 6px;
		border: 1px solid rgba(211, 155, 56, 0.4);
		border-radius: 4px;
		background: rgba(211, 155, 56, 0.1);
		color: #e2b95f;
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 11px;
		font-weight: 600;
		line-height: 1.2;
	}

	.install-destination-card small {
		overflow-wrap: anywhere;
	}

	.install-version-change {
		display: flex !important;
		align-items: center;
		flex-direction: row !important;
		flex-wrap: wrap;
		gap: 5px !important;
		margin-top: 2px;
	}

	.install-version-current,
	.install-version-next {
		display: block !important;
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 12px;
		line-height: 1.4;
	}

	.install-version-current {
		color: var(--text-muted);
	}

	.install-version-arrow {
		display: block !important;
		color: #e4b75c;
		font-size: 14px;
		font-weight: 600;
		line-height: 1;
	}

	.install-version-next {
		color: #55c4a5;
	}

	:global(.install-version-warning) {
		flex: 0 0 auto;
		color: #f08a24;
	}

	.install-destination-card {
		display: flex;
		min-width: 0;
		align-items: flex-start;
		gap: 9px;
		margin-top: 6px;
		padding: 8px;
		cursor: pointer;
	}

	.install-destination-card:hover {
		border-color: var(--line-strong);
		background: rgba(255, 255, 255, 0.04);
	}

	.install-destination-radio {
		accent-color: #399b82;
	}

	.install-destination-content {
		display: grid;
		min-width: 0;
		flex: 1 1 0;
		gap: 3px;
	}

	.install-destination-custom-control {
		display: flex;
		min-width: 0;
		gap: 6px;
		margin-top: 8px;
	}

	.install-destination-input {
		width: 0;
		flex: 1 1 0;
		margin: 0;
		font-family: 'Cascadia Code', 'Courier New', monospace;
	}

	.install-destination-reset {
		display: inline-flex;
		align-items: center;
		align-self: stretch;
		justify-content: center;
		width: 26px;
		flex: 0 0 auto;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
	}

	.install-destination-reset:hover,
	.install-destination-reset:focus-visible {
		border-color: rgba(57, 155, 130, 0.55);
		background: rgba(57, 155, 130, 0.1);
		color: var(--text);
		outline: none;
	}

	.install-destination-reset:disabled {
		cursor: wait;
		opacity: 0.5;
	}

	.install-destination-input:read-only {
		cursor: pointer;
		background: rgba(8, 14, 16, 0.38);
		color: var(--text-muted);
		opacity: 0.62;
	}

	.install-destination-input:disabled {
		cursor: wait;
		opacity: 0.5;
	}

	.install-review {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 8px;
		padding: 11px 12px;
		border: 1px solid rgba(57, 155, 130, 0.32);
		border-radius: 5px;
		background: rgba(57, 155, 130, 0.06);
	}

	.install-provenance {
		display: grid;
		gap: 9px;
		padding: 11px 12px;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: rgba(255, 255, 255, 0.025);
		color: var(--text-muted);
		font-size: 12px;
		line-height: 1.45;
	}

	.curated-provenance {
		border-color: rgba(57, 155, 130, 0.32);
		background: rgba(57, 155, 130, 0.06);
	}

	.install-provenance-heading,
	.install-provenance-grid span {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.install-provenance-heading {
		color: var(--text);
	}

	.install-provenance-heading :global(svg) {
		color: #55c4a5;
	}

	.install-provenance-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px 14px;
	}

	.install-provenance-grid > div {
		display: grid;
		gap: 3px;
		min-width: 0;
	}

	.install-provenance-grid span {
		color: var(--text-dim);
		font-size: 11px;
		text-transform: uppercase;
	}

	.install-provenance p {
		margin: 0;
	}

	.install-provenance code {
		max-width: 100%;
		overflow-wrap: anywhere;
	}

	.install-message {
		margin: 0;
		color: var(--text-muted);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 12px;
		line-height: 1.45;
	}

	.install-message.is-success {
		color: #399b82;
	}

	.install-message.is-error {
		color: #df6d58;
	}

	.install-dialog-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 0;
	}

	.dialog-secondary-button,
	.dialog-primary-button {
		min-height: 34px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 5px;
		font: inherit;
		font-size: 12px;
		cursor: pointer;
	}

	.dialog-secondary-button {
		background: transparent;
		color: var(--text-muted);
	}

	.dialog-primary-button {
		border-color: rgba(57, 155, 130, 0.5);
		background: #2e8065;
		color: #f2fff9;
	}

	.dialog-secondary-button:hover,
	.dialog-secondary-button:focus-visible,
	.dialog-primary-button:hover:not(:disabled),
	.dialog-primary-button:focus-visible:not(:disabled) {
		border-color: #e7d6ae;
		outline: none;
	}

	.dialog-primary-button:hover:not(:disabled),
	.dialog-primary-button:focus-visible:not(:disabled) {
		background: #399b82;
	}

	.dialog-primary-button:disabled {
		cursor: default;
		opacity: 0.55;
	}

	.install-dialog-actions .dialog-secondary-button {
		border-color: rgba(223, 109, 88, 0.5);
		color: #df6d58;
	}

	@media (max-width: 760px) {
		.install-dialog-backdrop {
			padding: 12px;
		}

		.install-dialog {
			height: calc(100dvh - 24px);
			max-height: calc(100dvh - 24px);
			padding: 16px;
		}

		.install-dialog-header-controls {
			width: 100%;
			margin-left: 0;
		}

		.install-dialog-header-controls .install-dialog-actions {
			flex: 1 1 auto;
		}

		.install-dialog-layout {
			grid-template-columns: minmax(0, 1fr);
			gap: 14px;
		}

		.version-panel {
			max-height: 300px;
		}

		.install-dialog-column {
			margin-top: 0;
		}

		.install-target-options {
			grid-template-columns: minmax(0, 1fr);
		}

		.install-fieldset-heading {
			align-items: flex-start;
			flex-direction: column;
		}

		.install-dialog-actions {
			align-items: stretch;
			flex-direction: row;
		}

		.install-provenance-grid {
			grid-template-columns: minmax(0, 1fr);
		}

		.install-dialog-actions button {
			flex: 1 1 0;
			min-width: 0;
		}

		.install-package-chooser-row {
			grid-template-columns: minmax(0, 1fr);
		}

		.install-manifest-mode-options {
			width: 100%;
		}
	}
</style>
