<script lang="ts">
	import {
		activationStatusLabels,
		type ActivationTarget,
		type HoudiniInstall,
		type PluginRecord
	} from './types';
	import { isOfficialPlugin } from './model';

	type Props = {
		plugins: PluginRecord[];
		installs: HoudiniInstall[];
		targets: ActivationTarget[];
		selectedId: string | null;
		onselect: (id: string) => void;
	};

	let { plugins, installs, targets, selectedId, onselect }: Props = $props();
	let sortedPlugins = $derived(
		[...plugins].sort(
			(left, right) => Number(isOfficialPlugin(left)) - Number(isOfficialPlugin(right))
		)
	);

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
			{#each sortedPlugins as plugin (plugin.id)}
				{@const pluginId = `plugin:${plugin.id}`}
				<tr
					class={['plugin-row', selectedId === pluginId && 'is-selected']}
					tabindex="0"
					aria-selected={selectedId === pluginId}
					onclick={() => onselect(pluginId)}
					onkeydown={(event) => {
						if (event.key === 'Enter' || event.key === ' ') {
							event.preventDefault();
							onselect(pluginId);
						}
					}}
				>
					<th scope="row">
						<div class="plugin-name">
							<strong>{plugin.name}</strong>
							<span>{plugin.version} / {plugin.source}</span>
						</div>
					</th>
					{#each installs as install (install.id)}
						{@const target = targetFor(plugin.id, install.id)}
						{@const status = target?.status ?? 'missing'}
						<td class={['status-cell', `status-${status}`]}>
							<div class="status-content">
								<span class="status-dot"></span>
								<span>{activationStatusLabels[status]}</span>
								{#if target?.artifactVersion}
									<small>{target.artifactVersion}</small>
								{/if}
							</div>
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
		overflow-y: auto;
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
		padding: 4px 14px;
		border-bottom: 1px solid var(--line);
		vertical-align: middle;
	}

	thead th {
		background: var(--surface-muted);
		color: #a8bbb4;
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 12px;
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
		font-size: 12px;
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

	.plugin-row {
		transition: background 140ms ease;
	}

	.plugin-row:hover th,
	.plugin-row:hover td,
	.plugin-row:focus-visible th,
	.plugin-row:focus-visible td {
		background: rgba(255, 255, 255, 0.07);
		outline: none;
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
		font-size: 12px;
	}

	.status-content {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: 7px;
		min-width: 120px;
		font-size: 12px;
		font-weight: 600;
	}

	.status-content small {
		grid-column: 2;
		color: var(--text-dim);
		font-family: 'Cascadia Code', 'Courier New', monospace;
		font-size: 12px;
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
