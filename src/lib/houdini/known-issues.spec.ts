import { describe, expect, it } from 'vitest';
import {
	isTargetIssue,
	knownIssueKinds,
	pathAliasLocationMessage,
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

	it('describes invalid path alias locations', () => {
		const context = {
			pathAliasLocationIssue: { hpath: true, houdiniPath: false }
		};

		expect(knownIssueKinds(context)).toContain('invalid-path-alias-location');
		expect(pathAliasLocationMessage(context.pathAliasLocationIssue)).toContain(
			'hpath is in an invalid JSON location'
		);
		expect(targetIssueSummary(context)).toBe('Invalid path alias location');
		expect(targetIssueMessages(context)).toEqual([
			'hpath is in an invalid JSON location; hpath must be top-level and HOUDINI_PATH must be inside an object in env[].'
		]);
	});

	it('describes undefined variable references as non-autofixable warnings', () => {
		const target = {
			status: 'warning' as const,
			packagePath: 'C:/packages/MOPS.json',
			undefinedVariableReferences: ['MISSING']
		};

		expect(knownIssueKinds(target)).toContain('undefined-variable-reference');
		expect(targetIssueSummary(target)).toBe('Undefined variable reference');
		expect(targetIssueMessages(target)).toEqual([
			'Package config references undefined variable key: $MISSING. Add the missing key or replace the reference; no reliable autofix is available.'
		]);
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
