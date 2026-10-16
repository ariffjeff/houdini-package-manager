<script lang="ts">
	import { Plus, Trash2 } from '@lucide/svelte';
	import {
		clonePackageConfig,
		knownPackageConfigKeys,
		updatePackageConfigValue,
		type HoudiniPackageConfigKey
	} from '$lib/houdini/package-config-schema';

	type Props = {
		config: Record<string, unknown>;
		disabled?: boolean;
		onChange?: (config: Record<string, unknown>) => void;
	};

	type EditableKey = Exclude<HoudiniPackageConfigKey, 'path' | 'hpath'>;
	type ControlKind = 'boolean' | 'integer' | 'list' | 'environment';
	type ControlDefinition = {
		key: EditableKey;
		label: string;
		description: string;
		kind: ControlKind;
		defaultValue: unknown;
	};

	type JsonShape = 'array' | 'object' | 'string' | 'number' | 'boolean' | 'null' | 'undefined';
	type JsonDraft = {
		source: string;
		text: string;
		error: string;
	};

	type EnvironmentVariableRow = {
		id: string;
		kind: 'variable';
		name: string;
		value: unknown;
		arrayIndex?: number;
	};

	type EnvironmentAdvancedRow = {
		id: string;
		kind: 'advanced';
		value: unknown;
		arrayIndex: number;
	};

	type EnvironmentRow = EnvironmentVariableRow | EnvironmentAdvancedRow;

	const controls: readonly ControlDefinition[] = [
		{
			key: 'enable',
			label: 'Enable package',
			description: 'Controls whether Houdini loads this package.',
			kind: 'boolean',
			defaultValue: true
		},
		{
			key: 'load_package_once',
			label: 'Load package once',
			description: 'Avoid loading this package more than once across package roots.',
			kind: 'boolean',
			defaultValue: false
		},
		{
			key: 'process_order',
			label: 'Process order',
			description: 'Sets the integer order Houdini uses when processing this package.',
			kind: 'integer',
			defaultValue: 0
		},
		{
			key: 'package_path',
			label: 'Package path',
			description:
				'Adds package search paths while preserving expressions and advanced operations.',
			kind: 'list',
			defaultValue: ''
		},
		{
			key: 'env',
			label: 'Environment',
			description: 'Adds environment variables contributed by this package.',
			kind: 'environment',
			defaultValue: []
		},
		{
			key: 'requires',
			label: 'Required packages',
			description: 'Lists package requirements or a Houdini condition expression.',
			kind: 'list',
			defaultValue: ''
		},
		{
			key: 'recommends',
			label: 'Recommended packages',
			description: 'Lists optional package recommendations or a Houdini condition expression.',
			kind: 'list',
			defaultValue: ''
		},
		{
			key: 'preload_libraries',
			label: 'Preload libraries',
			description: 'Lists libraries Houdini should load before the package.',
			kind: 'list',
			defaultValue: []
		},
		{
			key: 'show',
			label: 'Show package',
			description: 'Controls whether this package is shown in Houdini package views.',
			kind: 'boolean',
			defaultValue: true
		}
	];

	const destinationKeys = ['path', 'hpath', 'HOUDINI_PATH'] as const;
	const editableKeySet = new Set<string>(controls.map((control) => control.key));

	let { config = $bindable(), disabled = false, onChange }: Props = $props();

	let jsonDrafts = $state<Record<string, JsonDraft>>({});
	let environmentRows = $derived(readEnvironmentRows(config.env));
	let preservedEntries = $derived(
		Object.entries(config).filter(
			([key]) =>
				!editableKeySet.has(key) &&
				!destinationKeys.includes(key as (typeof destinationKeys)[number])
		)
	);

	function hasConfigValue(key: string): boolean {
		return Object.prototype.hasOwnProperty.call(config, key) && config[key] !== undefined;
	}

	function commitConfigValue(key: EditableKey, value: unknown): void {
		const nextConfig = updatePackageConfigValue(config, key, value);
		config = nextConfig;
		onChange?.(nextConfig);
	}

	function addControl(control: ControlDefinition): void {
		commitConfigValue(control.key, control.defaultValue);
	}

	function isRecord(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null && !Array.isArray(value);
	}

	function isStringList(value: unknown): value is string[] {
		return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
	}

	function isSimpleStringListValue(value: unknown): value is string | string[] {
		return typeof value === 'string' || isStringList(value);
	}

	function listValues(value: string | string[]): string[] {
		return typeof value === 'string' ? [value] : value;
	}

	function listRowKey(key: EditableKey, index: number, value: string): string {
		return `${key}:${index}:${value}`;
	}

	function updateListItem(key: EditableKey, index: number, value: string): void {
		const currentValue = config[key];
		if (typeof currentValue === 'string' && index === 0) {
			commitConfigValue(key, value);
			return;
		}
		if (!isStringList(currentValue) || index >= currentValue.length) return;
		const nextValue = [...currentValue];
		nextValue[index] = value;
		commitConfigValue(key, nextValue);
	}

	function addListItem(key: EditableKey): void {
		const currentValue = config[key];
		if (typeof currentValue === 'string') {
			commitConfigValue(key, [currentValue, '']);
		} else if (isStringList(currentValue)) {
			commitConfigValue(key, [...currentValue, '']);
		}
	}

	function removeListItem(key: EditableKey, index: number): void {
		const currentValue = config[key];
		if (typeof currentValue === 'string' && index === 0) {
			commitConfigValue(key, undefined);
			return;
		}
		if (!isStringList(currentValue) || index >= currentValue.length) return;
		const nextValue = currentValue.filter((_, entryIndex) => entryIndex !== index);
		commitConfigValue(key, nextValue);
	}

	function jsonText(value: unknown): string {
		try {
			return JSON.stringify(value, null, 2) ?? 'null';
		} catch {
			return String(value);
		}
	}

	function jsonShape(value: unknown): JsonShape {
		if (Array.isArray(value)) return 'array';
		if (isRecord(value)) return 'object';
		if (typeof value === 'string') return 'string';
		if (typeof value === 'number') return 'number';
		if (typeof value === 'boolean') return 'boolean';
		if (value === null) return 'null';
		return 'undefined';
	}

	function jsonShapeLabel(shape: JsonShape): string {
		switch (shape) {
			case 'array':
				return 'a JSON array';
			case 'object':
				return 'a JSON object';
			case 'string':
				return 'a JSON string';
			case 'number':
				return 'a JSON number';
			case 'boolean':
				return 'a JSON boolean';
			case 'null':
				return 'JSON null';
			default:
				return 'valid JSON';
		}
	}

	function jsonDraftText(id: string, value: unknown): string {
		const source = jsonText(value);
		const draft = jsonDrafts[id];
		return draft?.source === source ? draft.text : source;
	}

	function jsonDraftError(id: string, value: unknown): string {
		const source = jsonText(value);
		const draft = jsonDrafts[id];
		return draft?.source === source ? draft.error : '';
	}

	function jsonErrorId(id: string): string {
		return `${id.replace(/[^A-Za-z0-9_-]/g, '-')}-json-error`;
	}

	function setJsonDraft(id: string, value: unknown, text: string, error: string): void {
		jsonDrafts[id] = { source: jsonText(value), text, error };
	}

	function clearJsonDraft(id: string): void {
		delete jsonDrafts[id];
	}

	function editJsonValue(
		id: string,
		currentValue: unknown,
		text: string,
		onValid: (value: unknown) => void
	): void {
		try {
			const nextValue = JSON.parse(text) as unknown;
			const expectedShape = jsonShape(currentValue);
			if (expectedShape !== 'undefined' && jsonShape(nextValue) !== expectedShape) {
				setJsonDraft(
					id,
					currentValue,
					text,
					`Keep this value as ${jsonShapeLabel(expectedShape)}.`
				);
				return;
			}
			clearJsonDraft(id);
			onValid(nextValue);
		} catch {
			setJsonDraft(id, currentValue, text, 'Enter valid JSON before applying this value.');
		}
	}

	function updateInteger(key: EditableKey, text: string): void {
		if (!text.trim()) return;
		const value = Number(text);
		if (Number.isInteger(value)) commitConfigValue(key, value);
	}

	function readEnvironmentRows(value: unknown): EnvironmentRow[] {
		if (Array.isArray(value)) {
			const rows: EnvironmentRow[] = [];
			value.forEach((entry, arrayIndex) => {
				if (isRecord(entry)) {
					for (const [name, entryValue] of Object.entries(entry)) {
						rows.push({
							id: `array:${arrayIndex}:${name}`,
							kind: 'variable',
							name,
							value: entryValue,
							arrayIndex
						});
					}
					return;
				}
				rows.push({
					id: `array:${arrayIndex}:advanced`,
					kind: 'advanced',
					value: entry,
					arrayIndex
				});
			});
			return rows;
		}
		if (isRecord(value)) {
			return Object.entries(value).map(([name, entryValue]) => ({
				id: `record:${name}`,
				kind: 'variable' as const,
				name,
				value: entryValue
			}));
		}
		return [];
	}

	function environmentDraftId(rowId: string): string {
		return `env:${rowId}`;
	}

	function environmentNames(value: unknown): string[] {
		return readEnvironmentRows(value)
			.filter((row): row is EnvironmentVariableRow => row.kind === 'variable')
			.map((row) => row.name);
	}

	function nextEnvironmentName(value: unknown): string {
		const names = new Set(environmentNames(value));
		let name = 'NEW_VARIABLE';
		let suffix = 1;
		while (names.has(name)) {
			name = `NEW_VARIABLE_${suffix}`;
			suffix += 1;
		}
		return name;
	}

	function clonedEnvironment(): unknown {
		return clonePackageConfig({ env: config.env }).env;
	}

	function commitEnvironmentValue(mutator: (environment: unknown) => void): void {
		const nextEnvironment = clonedEnvironment();
		mutator(nextEnvironment);
		commitConfigValue('env', nextEnvironment);
	}

	function addEnvironmentRow(): void {
		const currentEnvironment = config.env;
		const name = nextEnvironmentName(currentEnvironment);
		if (Array.isArray(currentEnvironment)) {
			const nextEnvironment = [...currentEnvironment, { [name]: '' }];
			commitConfigValue('env', nextEnvironment);
			return;
		}
		if (isRecord(currentEnvironment)) {
			commitEnvironmentValue((environment) => {
				if (isRecord(environment)) environment[name] = '';
			});
			return;
		}
		commitConfigValue('env', [{ [name]: '' }]);
	}

	function updateEnvironmentVariable(
		row: EnvironmentVariableRow,
		field: 'name' | 'value',
		nextValue: unknown
	): void {
		commitEnvironmentValue((environment) => {
			if (Array.isArray(environment)) {
				if (row.arrayIndex === undefined) return;
				const entry = environment[row.arrayIndex];
				if (!isRecord(entry)) return;
				if (field === 'name') {
					if (!nextValue || typeof nextValue !== 'string' || nextValue === row.name) return;
					if (Object.prototype.hasOwnProperty.call(entry, nextValue)) return;
					const oldValue = entry[row.name];
					delete entry[row.name];
					entry[nextValue] = oldValue;
				} else {
					entry[row.name] = nextValue;
				}
				return;
			}
			if (!isRecord(environment)) return;
			if (field === 'name') {
				if (!nextValue || typeof nextValue !== 'string' || nextValue === row.name) return;
				if (Object.prototype.hasOwnProperty.call(environment, nextValue)) return;
				const oldValue = environment[row.name];
				delete environment[row.name];
				environment[nextValue] = oldValue;
			} else {
				environment[row.name] = nextValue;
			}
		});
	}

	function updateEnvironmentNumber(row: EnvironmentVariableRow, text: string): void {
		if (!text.trim()) return;
		const value = Number(text);
		if (Number.isFinite(value)) updateEnvironmentVariable(row, 'value', value);
	}

	function updateEnvironmentAdvanced(row: EnvironmentRow, value: unknown): void {
		if (row.kind === 'variable') {
			updateEnvironmentVariable(row, 'value', value);
			return;
		}
		commitEnvironmentValue((environment) => {
			if (Array.isArray(environment)) environment[row.arrayIndex] = value;
		});
	}

	function removeEnvironmentRow(row: EnvironmentRow): void {
		commitEnvironmentValue((environment) => {
			if (Array.isArray(environment)) {
				if (row.arrayIndex === undefined) return;
				if (row.kind === 'advanced') {
					environment.splice(row.arrayIndex, 1);
					return;
				}
				const entry = environment[row.arrayIndex];
				if (!isRecord(entry)) return;
				delete entry[row.name];
				if (!Object.keys(entry).length) environment.splice(row.arrayIndex, 1);
				return;
			}
			if (isRecord(environment) && row.kind === 'variable') delete environment[row.name];
		});
	}

	function displayValue(value: unknown): string {
		return jsonText(value).replace(/\s+/g, ' ').trim();
	}
</script>

<div class="package-config-controls">
	<header class="package-config-heading">
		<div>
			<strong>Package controls</strong>
			<p>Edit recognized Houdini package keys without changing preserved JSON.</p>
		</div>
	</header>

	<div class="package-config-card-list">
		{#each controls as control (control.key)}
			{@const currentValue = config[control.key]}
			{@const present = hasConfigValue(control.key)}
			<section class="package-config-card" aria-labelledby={`${control.key}-control-title`}>
				<div class="package-config-card-heading">
					<div>
						<h3 id={`${control.key}-control-title`}>
							<code>{control.key}</code>
							<span>{control.label}</span>
						</h3>
						<p>{control.description}</p>
					</div>
					{#if present}
						<span class="package-config-status">Configured</span>
					{/if}
				</div>

				{#if !present}
					<div class="package-config-empty">
						<span>This optional key is not present.</span>
						<button
							type="button"
							class="package-config-button"
							{disabled}
							onclick={() => addControl(control)}
						>
							<Plus size={14} strokeWidth={2} aria-hidden="true" />
							<span>Add</span>
						</button>
					</div>
				{:else if control.kind === 'boolean'}
					<div class="package-config-control-body">
						{#if typeof currentValue === 'boolean'}
							<label class="package-config-checkbox">
								<input
									type="checkbox"
									checked={currentValue}
									{disabled}
									onchange={(event) =>
										commitConfigValue(
											control.key,
											(event.currentTarget as HTMLInputElement).checked
										)}
								/>
								<span>{currentValue ? 'Enabled' : 'Disabled'}</span>
							</label>
						{:else if typeof currentValue === 'string'}
							<label class="package-config-field">
								<span>Expression or value</span>
								<input
									type="text"
									value={currentValue}
									{disabled}
									oninput={(event) =>
										commitConfigValue(control.key, (event.currentTarget as HTMLInputElement).value)}
								/>
							</label>
						{:else}
							<label class="package-config-field">
								<span>Conditional JSON value</span>
								<textarea
									rows="3"
									value={jsonDraftText(control.key, currentValue)}
									{disabled}
									aria-invalid={Boolean(jsonDraftError(control.key, currentValue))}
									aria-describedby={jsonDraftError(control.key, currentValue)
										? jsonErrorId(control.key)
										: undefined}
									oninput={(event) =>
										editJsonValue(
											control.key,
											currentValue,
											(event.currentTarget as HTMLTextAreaElement).value,
											(value) => commitConfigValue(control.key, value)
										)}></textarea>
							</label>
							{#if jsonDraftError(control.key, currentValue)}
								<p id={jsonErrorId(control.key)} class="package-config-error" aria-live="polite">
									{jsonDraftError(control.key, currentValue)}
								</p>
							{/if}
						{/if}
					</div>
				{:else if control.kind === 'integer'}
					<div class="package-config-control-body">
						{#if typeof currentValue === 'number' && Number.isInteger(currentValue)}
							<label class="package-config-field">
								<span>Integer value</span>
								<input
									type="number"
									step="1"
									value={currentValue}
									{disabled}
									oninput={(event) =>
										updateInteger(control.key, (event.currentTarget as HTMLInputElement).value)}
								/>
							</label>
						{:else}
							<label class="package-config-field">
								<span>Advanced JSON value</span>
								<textarea
									rows="3"
									value={jsonDraftText(control.key, currentValue)}
									{disabled}
									aria-invalid={Boolean(jsonDraftError(control.key, currentValue))}
									aria-describedby={jsonDraftError(control.key, currentValue)
										? jsonErrorId(control.key)
										: undefined}
									oninput={(event) =>
										editJsonValue(
											control.key,
											currentValue,
											(event.currentTarget as HTMLTextAreaElement).value,
											(value) => commitConfigValue(control.key, value)
										)}></textarea>
							</label>
							{#if jsonDraftError(control.key, currentValue)}
								<p id={jsonErrorId(control.key)} class="package-config-error" aria-live="polite">
									{jsonDraftError(control.key, currentValue)}
								</p>
							{/if}
						{/if}
					</div>
				{:else if control.kind === 'list'}
					<div class="package-config-control-body">
						{#if isSimpleStringListValue(currentValue)}
							{@const values = listValues(currentValue)}
							<div class="package-config-list-editor">
								{#if values.length}
									<div class="package-config-list-rows">
										{#each values as value, index (listRowKey(control.key, index, value))}
											<div class="package-config-list-row">
												<label class="package-config-field">
													<span>Value {index + 1}</span>
													<input
														type="text"
														{value}
														{disabled}
														onchange={(event) =>
															updateListItem(
																control.key,
																index,
																(event.currentTarget as HTMLInputElement).value
															)}
													/>
												</label>
												<button
													type="button"
													class="package-config-icon-button"
													aria-label={`Remove ${control.label} value ${index + 1}`}
													title="Remove value"
													{disabled}
													onclick={() => removeListItem(control.key, index)}
												>
													<Trash2 size={14} strokeWidth={1.9} aria-hidden="true" />
												</button>
											</div>
										{/each}
									</div>
								{:else}
									<p class="package-config-empty-row">No values configured.</p>
								{/if}
								<div class="package-config-list-actions">
									<button
										type="button"
										class="package-config-button"
										{disabled}
										onclick={() => addListItem(control.key)}
									>
										<Plus size={14} strokeWidth={2} aria-hidden="true" />
										<span>Add value</span>
									</button>
									{#if typeof currentValue === 'string'}
										<span class="package-config-hint"
											>The current scalar stays a string until another value is added.</span
										>
									{/if}
								</div>
							</div>
						{:else}
							<label class="package-config-field">
								<span>Advanced JSON value</span>
								<textarea
									rows="3"
									value={jsonDraftText(control.key, currentValue)}
									{disabled}
									aria-invalid={Boolean(jsonDraftError(control.key, currentValue))}
									aria-describedby={jsonDraftError(control.key, currentValue)
										? jsonErrorId(control.key)
										: undefined}
									oninput={(event) =>
										editJsonValue(
											control.key,
											currentValue,
											(event.currentTarget as HTMLTextAreaElement).value,
											(value) => commitConfigValue(control.key, value)
										)}></textarea>
							</label>
							{#if jsonDraftError(control.key, currentValue)}
								<p id={jsonErrorId(control.key)} class="package-config-error" aria-live="polite">
									{jsonDraftError(control.key, currentValue)}
								</p>
							{/if}
						{/if}
					</div>
				{:else}
					<div class="package-config-control-body">
						{#if Array.isArray(currentValue) || isRecord(currentValue)}
							<div class="package-config-environment-editor">
								{#if environmentRows.length}
									<div class="package-config-environment-rows">
										{#each environmentRows as row (row.id)}
											{#if row.kind === 'variable'}
												<div class="package-config-environment-row">
													<label class="package-config-field package-config-environment-name">
														<span>Variable name</span>
														<input
															type="text"
															value={row.name}
															{disabled}
															onchange={(event) =>
																updateEnvironmentVariable(
																	row,
																	'name',
																	(event.currentTarget as HTMLInputElement).value
																)}
														/>
													</label>
													{#if typeof row.value === 'string'}
														<label class="package-config-field package-config-environment-value">
															<span>Value</span>
															<input
																type="text"
																value={row.value}
																{disabled}
																oninput={(event) =>
																	updateEnvironmentVariable(
																		row,
																		'value',
																		(event.currentTarget as HTMLInputElement).value
																	)}
															/>
														</label>
													{:else if typeof row.value === 'number'}
														<label class="package-config-field package-config-environment-value">
															<span>Value</span>
															<input
																type="number"
																step="any"
																value={row.value}
																{disabled}
																oninput={(event) =>
																	updateEnvironmentNumber(
																		row,
																		(event.currentTarget as HTMLInputElement).value
																	)}
															/>
														</label>
													{:else if typeof row.value === 'boolean'}
														<label class="package-config-checkbox package-config-environment-value">
															<input
																type="checkbox"
																checked={row.value}
																{disabled}
																onchange={(event) =>
																	updateEnvironmentVariable(
																		row,
																		'value',
																		(event.currentTarget as HTMLInputElement).checked
																	)}
															/>
															<span>Boolean value</span>
														</label>
													{:else}
														<label class="package-config-field package-config-environment-value">
															<span>Advanced JSON value</span>
															<textarea
																rows="3"
																value={jsonDraftText(environmentDraftId(row.id), row.value)}
																{disabled}
																aria-invalid={Boolean(
																	jsonDraftError(environmentDraftId(row.id), row.value)
																)}
																aria-describedby={jsonDraftError(
																	environmentDraftId(row.id),
																	row.value
																)
																	? jsonErrorId(environmentDraftId(row.id))
																	: undefined}
																oninput={(event) =>
																	editJsonValue(
																		environmentDraftId(row.id),
																		row.value,
																		(event.currentTarget as HTMLTextAreaElement).value,
																		(value) => updateEnvironmentAdvanced(row, value)
																	)}></textarea>
														</label>
														{#if jsonDraftError(environmentDraftId(row.id), row.value)}
															<p
																id={jsonErrorId(environmentDraftId(row.id))}
																class="package-config-error"
																aria-live="polite"
															>
																{jsonDraftError(environmentDraftId(row.id), row.value)}
															</p>
														{/if}
													{/if}
													<button
														type="button"
														class="package-config-icon-button"
														aria-label={`Remove environment variable ${row.name}`}
														title="Remove variable"
														{disabled}
														onclick={() => removeEnvironmentRow(row)}
													>
														<Trash2 size={14} strokeWidth={1.9} aria-hidden="true" />
													</button>
												</div>
											{:else}
												<div class="package-config-environment-row package-config-advanced-row">
													<label class="package-config-field package-config-environment-value">
														<span>Advanced environment entry</span>
														<textarea
															rows="3"
															value={jsonDraftText(environmentDraftId(row.id), row.value)}
															{disabled}
															aria-invalid={Boolean(
																jsonDraftError(environmentDraftId(row.id), row.value)
															)}
															aria-describedby={jsonDraftError(
																environmentDraftId(row.id),
																row.value
															)
																? jsonErrorId(environmentDraftId(row.id))
																: undefined}
															oninput={(event) =>
																editJsonValue(
																	environmentDraftId(row.id),
																	row.value,
																	(event.currentTarget as HTMLTextAreaElement).value,
																	(value) => updateEnvironmentAdvanced(row, value)
																)}></textarea>
													</label>
													{#if jsonDraftError(environmentDraftId(row.id), row.value)}
														<p
															id={jsonErrorId(environmentDraftId(row.id))}
															class="package-config-error"
															aria-live="polite"
														>
															{jsonDraftError(environmentDraftId(row.id), row.value)}
														</p>
													{/if}
													<button
														type="button"
														class="package-config-icon-button"
														aria-label="Remove advanced environment entry"
														title="Remove entry"
														{disabled}
														onclick={() => removeEnvironmentRow(row)}
													>
														<Trash2 size={14} strokeWidth={1.9} aria-hidden="true" />
													</button>
												</div>
											{/if}
										{/each}
									</div>
								{:else}
									<p class="package-config-empty-row">No environment variables configured.</p>
								{/if}
								<button
									type="button"
									class="package-config-button"
									{disabled}
									onclick={addEnvironmentRow}
								>
									<Plus size={14} strokeWidth={2} aria-hidden="true" />
									<span>Add variable</span>
								</button>
							</div>
						{:else}
							<label class="package-config-field">
								<span>Advanced environment JSON</span>
								<textarea
									rows="3"
									value={jsonDraftText(control.key, currentValue)}
									{disabled}
									aria-invalid={Boolean(jsonDraftError(control.key, currentValue))}
									aria-describedby={jsonDraftError(control.key, currentValue)
										? jsonErrorId(control.key)
										: undefined}
									oninput={(event) =>
										editJsonValue(
											control.key,
											currentValue,
											(event.currentTarget as HTMLTextAreaElement).value,
											(value) => commitConfigValue(control.key, value)
										)}></textarea>
							</label>
							{#if jsonDraftError(control.key, currentValue)}
								<p id={jsonErrorId(control.key)} class="package-config-error" aria-live="polite">
									{jsonDraftError(control.key, currentValue)}
								</p>
							{/if}
						{/if}
					</div>
				{/if}
			</section>
		{/each}
	</div>

	{#if preservedEntries.length}
		<section class="package-config-preserved" aria-labelledby="package-preserved-title">
			<div>
				<strong id="package-preserved-title">Preserved keys</strong>
				<p>These top-level keys are unchanged here. Manual JSON mode is required to edit them.</p>
			</div>
			<div class="package-config-preserved-list">
				{#each preservedEntries as [key, value] (key)}
					<div class="package-config-preserved-row">
						<div>
							<code>{key}</code>
							<span class="package-config-preserved-kind">
								{(knownPackageConfigKeys as readonly string[]).includes(key)
									? 'Known metadata'
									: 'Unknown key'}
							</span>
						</div>
						<code class="package-config-preserved-value">{displayValue(value)}</code>
					</div>
				{/each}
			</div>
		</section>
	{/if}
</div>

<style>
	.package-config-controls {
		display: grid;
		min-width: 0;
		gap: 10px;
		color: var(--text-muted);
	}

	.package-config-heading,
	.package-config-preserved {
		display: grid;
		gap: 8px;
		padding: 12px;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: rgba(0, 0, 0, 0.1);
	}

	.package-config-heading strong,
	.package-config-preserved strong {
		color: var(--text-dim);
		font-size: 12px;
	}

	.package-config-heading p,
	.package-config-preserved p {
		margin: 4px 0 0;
		color: var(--text-muted);
		font-size: 12px;
		line-height: 1.45;
	}

	.package-config-preserved code,
	.package-config-card code {
		color: #f0c875;
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 0.95em;
	}

	.package-config-preserved-list {
		display: grid;
		gap: 5px;
	}

	.package-config-preserved-row {
		display: grid;
		grid-template-columns: minmax(120px, 0.35fr) minmax(0, 1fr);
		gap: 10px;
		align-items: baseline;
		padding: 6px 8px;
		border: 1px solid rgba(211, 155, 56, 0.18);
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.12);
		font-size: 12px;
	}

	.package-config-preserved-value {
		min-width: 0;
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 11px;
		overflow-wrap: anywhere;
	}

	.package-config-card-list {
		display: grid;
		min-width: 0;
		gap: 10px;
	}

	.package-config-card {
		display: grid;
		min-width: 0;
		gap: 10px;
		padding: 12px;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: rgba(0, 0, 0, 0.12);
	}

	.package-config-card-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}

	.package-config-card-heading h3 {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 7px;
		margin: 0;
		color: var(--text);
		font-size: 13px;
		font-weight: 600;
	}

	.package-config-card-heading h3 span {
		color: var(--text-dim);
	}

	.package-config-card-heading p {
		max-width: 680px;
		margin: 4px 0 0;
		color: var(--text-muted);
		font-size: 12px;
		line-height: 1.45;
	}

	.package-config-status,
	.package-config-preserved-kind {
		flex: 0 0 auto;
		padding: 3px 6px;
		border: 1px solid rgba(57, 155, 130, 0.38);
		border-radius: 4px;
		background: rgba(57, 155, 130, 0.08);
		color: #b8ded2;
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.package-config-empty,
	.package-config-list-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}

	.package-config-empty,
	.package-config-empty-row {
		color: var(--text-muted);
		font-size: 12px;
	}

	.package-config-empty-row {
		margin: 0;
		padding: 8px;
		border: 1px dashed rgba(255, 255, 255, 0.12);
		border-radius: 4px;
	}

	.package-config-button,
	.package-config-icon-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		border: 1px solid rgba(57, 155, 130, 0.45);
		border-radius: 4px;
		background: rgba(57, 155, 130, 0.1);
		color: #b8ded2;
		font: inherit;
		font-size: 12px;
		cursor: pointer;
	}

	.package-config-button {
		padding: 6px 9px;
	}

	.package-config-icon-button {
		width: 32px;
		height: 32px;
		flex: 0 0 auto;
		padding: 0;
		border-color: rgba(223, 109, 88, 0.4);
		background: rgba(223, 109, 88, 0.08);
		color: #ffb09f;
	}

	.package-config-button:hover:not(:disabled),
	.package-config-button:focus-visible {
		border-color: #399b82;
		background: rgba(57, 155, 130, 0.18);
	}

	.package-config-icon-button:hover:not(:disabled),
	.package-config-icon-button:focus-visible {
		border-color: #df6d58;
		background: rgba(223, 109, 88, 0.16);
	}

	.package-config-button:focus-visible,
	.package-config-icon-button:focus-visible,
	.package-config-field input:focus-visible,
	.package-config-field textarea:focus-visible {
		outline: 2px solid rgba(57, 155, 130, 0.28);
		outline-offset: 1px;
	}

	.package-config-button:disabled,
	.package-config-icon-button:disabled,
	.package-config-field input:disabled,
	.package-config-field textarea:disabled,
	.package-config-checkbox input:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.package-config-control-body,
	.package-config-list-editor,
	.package-config-environment-editor {
		display: grid;
		min-width: 0;
		gap: 8px;
	}

	.package-config-field {
		display: grid;
		min-width: 0;
		gap: 5px;
	}

	.package-config-field > span,
	.package-config-checkbox span {
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 11px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.package-config-field input,
	.package-config-field textarea {
		box-sizing: border-box;
		min-width: 0;
		width: 100%;
		padding: 7px 8px;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: var(--surface-raised);
		color: var(--text);
		font: inherit;
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 12px;
	}

	.package-config-field textarea {
		min-height: 74px;
		resize: vertical;
	}

	.package-config-checkbox {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		width: fit-content;
		padding: 8px 9px;
		border: 1px solid rgba(57, 155, 130, 0.25);
		border-radius: 4px;
		background: rgba(57, 155, 130, 0.06);
		cursor: pointer;
	}

	.package-config-checkbox input {
		width: 14px;
		height: 14px;
		margin: 0;
		accent-color: #399b82;
	}

	.package-config-list-rows,
	.package-config-environment-rows {
		display: grid;
		min-width: 0;
		gap: 7px;
	}

	.package-config-list-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 32px;
		gap: 8px;
		align-items: end;
	}

	.package-config-hint {
		color: var(--text-muted);
		font-size: 11px;
		line-height: 1.4;
	}

	.package-config-environment-row {
		display: grid;
		grid-template-columns: minmax(150px, 0.7fr) minmax(0, 1fr) 32px;
		gap: 8px;
		align-items: end;
		padding: 8px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.1);
	}

	.package-config-environment-value {
		min-width: 0;
	}

	.package-config-environment-value.package-config-checkbox {
		align-self: end;
		min-height: 32px;
		box-sizing: border-box;
	}

	.package-config-advanced-row {
		grid-template-columns: minmax(0, 1fr) 32px;
		align-items: end;
	}

	.package-config-error {
		margin: 0;
		color: #ffb09f;
		font-size: 11px;
		line-height: 1.4;
	}

	.package-config-preserved-row > div {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 7px;
		min-width: 0;
	}

	.package-config-preserved-kind {
		padding: 2px 5px;
		border-color: rgba(211, 155, 56, 0.25);
		background: rgba(211, 155, 56, 0.06);
		color: var(--text-muted);
		font-size: 9px;
	}

	@media (max-width: 640px) {
		.package-config-card-heading {
			flex-direction: column;
		}

		.package-config-preserved-row {
			grid-template-columns: 1fr;
			gap: 4px;
		}

		.package-config-environment-row {
			grid-template-columns: minmax(0, 1fr) 32px;
		}

		.package-config-environment-name,
		.package-config-environment-value {
			grid-column: 1 / -1;
		}

		.package-config-environment-row > .package-config-icon-button {
			grid-column: 2;
			grid-row: 1 / span 2;
		}

		.package-config-advanced-row {
			grid-template-columns: minmax(0, 1fr) 32px;
		}
	}
</style>
