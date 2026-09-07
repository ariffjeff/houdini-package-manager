<script lang="ts">
	import {
		activationStatusLabels,
		type ActivationTarget,
		type HoudiniInstall,
		type PluginRecord
	} from './types';

	type Props = {
		plugins: PluginRecord[];
		installs: HoudiniInstall[];
		targets: ActivationTarget[];
		selectedId: string | null;
		onselect: (id: string) => void;
	};

	let { plugins, installs, targets, selectedId, onselect }: Props = $props();

	function targetFor(pluginId: string, installId: string) {
		return targets.find((target) => target.pluginId === pluginId && target.installId === installId);
	}
</script>

<div class="table-wrap">
	<table>
		<thead>
			<tr>
				<th scope="col" class="plugin-column">Plugin</th>
				{#each installs as install (install.id)}
					<th scope="col">
						<span>{install.version}</span>
						<small>{install.platform} / {install.build}</small>
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each plugins as plugin (plugin.id)}
				{@const pluginId = `plugin:${plugin.id}`}
				<tr class={['plugin-row', selectedId === pluginId && 'is-selected']}>
					<th scope="row">
						<button type="button" class="plugin-name" onclick={() => onselect(pluginId)}>
							<strong>{plugin.name}</strong>
							<span>{plugin.version} / {plugin.source}</span>
						</button>
					</th>
					{#each installs as install (install.id)}
						{@const target = targetFor(plugin.id, install.id)}
						{@const status = target?.status ?? 'missing'}
						<td>
							<button
								type="button"
								class={['status-cell', `status-${status}`]}
								onclick={() => onselect(pluginId)}
								aria-label={`${plugin.name} on ${install.label}: ${activationStatusLabels[status]}`}
							>
								<span class="status-dot"></span>
								<span>{activationStatusLabels[status]}</span>
								{#if target?.artifactVersion}
									<small>{target.artifactVersion}</small>
								{/if}
							</button>
						</td>
					{/each}
				</tr>
			{:else}
				<tr>
					<td colspan={installs.length + 1} class="empty-row">No plugins match this filter.</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.table-wrap {
		overflow-x: auto;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--surface);
	}

	table {
		width: 100%;
		min-width: 720px;
		border-collapse: collapse;
		text-align: left;
	}

	th,
	td {
		padding: 16px 18px;
		border-bottom: 1px solid var(--line);
		vertical-align: middle;
	}

	thead th {
		background: var(--surface-muted);
		color: #a8bbb4;
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	thead th span,
	thead th small {
		display: block;
	}

	thead th small {
		margin-top: 5px;
		color: var(--text-dim);
		font-size: 9px;
		letter-spacing: 0.02em;
		text-transform: none;
	}

	.plugin-column {
		width: 34%;
	}

	tbody tr:last-child th,
	tbody tr:last-child td {
		border-bottom: 0;
	}

	.plugin-row.is-selected th,
	.plugin-row.is-selected td {
		background: rgba(57, 155, 130, 0.1);
	}

	.plugin-name,
	.status-cell {
		border: 0;
		background: transparent;
		color: inherit;
		cursor: pointer;
		text-align: left;
	}

	.plugin-name {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	.plugin-name strong {
		font-size: 15px;
		font-weight: 650;
	}

	.plugin-name span {
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 10px;
	}

	.status-cell {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: 7px;
		min-width: 120px;
		padding: 7px 8px;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 600;
		transition: background 140ms ease;
	}

	.status-cell:hover,
	.status-cell:focus-visible,
	.plugin-name:hover,
	.plugin-name:focus-visible {
		outline: none;
		background: rgba(255, 255, 255, 0.07);
	}

	.status-cell small {
		grid-column: 2;
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 9px;
		font-weight: 400;
	}

	.status-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: currentColor;
	}

	.status-enabled {
		color: #318873;
	}

	.status-disabled {
		color: #7d8c86;
	}

	.status-warning {
		color: #ad7617;
	}

	.status-incompatible {
		color: #c55645;
	}

	.status-missing {
		color: #a2685b;
	}

	.empty-row {
		padding: 42px 18px;
		color: var(--text-muted);
		text-align: center;
	}
</style>
