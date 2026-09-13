import { describe, expect, it } from 'vitest';
import {
	isTargetIssue,
	knownIssueKinds,
	pathAliasConflictMessage,
	targetIssueMessages,
	targetIssueSummary
} from './known-issues';

describe('known issue catalog', () => {
	it('describes all path alias dependency states', () => {
		expect(
			pathAliasConflictMessage({
				hpathUsedAsVariable: true,
				houdiniPathUsedAsVariable: true
			})
		).toContain('both are used as variable dependencies');
		expect(
			pathAliasConflictMessage({
				hpathUsedAsVariable: true,
				houdiniPathUsedAsVariable: false
			})
		).toContain('HOUDINI_PATH is not used as a variable dependency');
		expect(
			pathAliasConflictMessage({
				hpathUsedAsVariable: false,
				houdiniPathUsedAsVariable: true
			})
		).toContain('hpath is not used as a variable dependency');
		expect(
			pathAliasConflictMessage({
				hpathUsedAsVariable: false,
				houdiniPathUsedAsVariable: false
			})
		).toContain('neither alias is used as a variable dependency');
	});

	it('classifies removed sources and status fallbacks without display-text parsing', () => {
		const removedSourceTarget = {
			status: 'warning' as const,
			packagePath: 'C:/packages/MOPS.json',
			note: 'Package config references removed HPM source: C:/old/MOPS'
		};
		const missingTarget = {
			status: 'missing' as const,
			packagePath: 'C:/packages/MOPS.json',
			note: ''
		};
		const incompatibleTarget = {
			status: 'incompatible' as const,
			packagePath: 'C:/packages/MOPS.json',
			note: ''
		};

		expect(knownIssueKinds(removedSourceTarget)).toContain('removed-hpm-source');
		expect(isTargetIssue(removedSourceTarget)).toBe(true);
		expect(targetIssueSummary(missingTarget)).toBe('Plugin source not found');
		expect(targetIssueSummary(incompatibleTarget)).toBe('Plugin is incompatible');
		expect(targetIssueMessages(missingTarget)).toEqual([
			'The package config does not resolve to an available plugin source.'
		]);
	});
});
