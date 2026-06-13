import { describe, expect, it } from 'vitest';
import type { DetectRule } from '../model/detect-rule.js';
import type { ProjectInspection } from '../model/project-inspection.js';
import { evaluateDetects } from './evaluate-detects.js';

const inspect = (overrides: Partial<ProjectInspection> = {}): ProjectInspection => ({
  dependencies: [],
  files: [],
  ...overrides,
});

describe('evaluateDetects', () => {
  it('returns unmatched when the rule list is empty (fallback preset)', () => {
    expect(evaluateDetects([], inspect({ dependencies: ['react'] }))).toEqual({
      matched: false,
      specificity: 0,
    });
  });

  it('returns unmatched when an entry has neither dependencies nor files (empty rule)', () => {
    expect(evaluateDetects([{}], inspect({ dependencies: ['react'] }))).toEqual({
      matched: false,
      specificity: 0,
    });
  });

  describe('dependencies-only rule', () => {
    it('matches when every required dependency is present', () => {
      const rule: DetectRule = { dependencies: ['react'] };
      const result = evaluateDetects([rule], inspect({ dependencies: ['react'] }));
      expect(result).toEqual({ matched: true, specificity: 1 });
    });

    it('does not match when ANY required dependency is missing (AND)', () => {
      const rule: DetectRule = { dependencies: ['react', 'next'] };
      const result = evaluateDetects([rule], inspect({ dependencies: ['react'] }));
      expect(result).toEqual({ matched: false, specificity: 0 });
    });

    it('specificity equals the count of matched dependencies', () => {
      const rule: DetectRule = { dependencies: ['react', '@tauri-apps/api'] };
      const result = evaluateDetects(
        [rule],
        inspect({ dependencies: ['react', '@tauri-apps/api', 'other'] }),
      );
      expect(result).toEqual({ matched: true, specificity: 2 });
    });
  });

  describe('files-only rule', () => {
    it('matches when every required file or directory is present', () => {
      const rule: DetectRule = { files: ['Cargo.toml'] };
      const result = evaluateDetects([rule], inspect({ files: ['Cargo.toml', 'README.md'] }));
      expect(result).toEqual({ matched: true, specificity: 1 });
    });

    it('tolerates a trailing slash so YAML can mark directories', () => {
      const rule: DetectRule = { files: ['src-tauri/'] };
      const result = evaluateDetects([rule], inspect({ files: ['src-tauri'] }));
      expect(result).toEqual({ matched: true, specificity: 1 });
    });
  });

  describe('combined rule (AND between dependencies and files)', () => {
    it('matches only when both sections are satisfied', () => {
      const rule: DetectRule = {
        dependencies: ['react'],
        files: ['src-tauri/'],
      };
      const inspection = inspect({ dependencies: ['react'], files: ['src-tauri'] });
      expect(evaluateDetects([rule], inspection)).toEqual({ matched: true, specificity: 2 });
    });

    it('does not match when dependencies pass but files miss', () => {
      const rule: DetectRule = {
        dependencies: ['react'],
        files: ['src-tauri/'],
      };
      const inspection = inspect({ dependencies: ['react'], files: [] });
      expect(evaluateDetects([rule], inspection)).toEqual({ matched: false, specificity: 0 });
    });

    it('does not match when files pass but dependencies miss', () => {
      const rule: DetectRule = {
        dependencies: ['react'],
        files: ['src-tauri/'],
      };
      const inspection = inspect({ dependencies: [], files: ['src-tauri'] });
      expect(evaluateDetects([rule], inspection)).toEqual({ matched: false, specificity: 0 });
    });
  });

  describe('multiple rules (OR between rules, winner by specificity)', () => {
    it('uses the winning rule when any rule matches', () => {
      const rules: readonly DetectRule[] = [{ dependencies: ['react'] }, { dependencies: ['vue'] }];
      expect(evaluateDetects(rules, inspect({ dependencies: ['vue'] }))).toEqual({
        matched: true,
        specificity: 1,
      });
    });

    it('returns the highest specificity when several rules match', () => {
      // Both rules match; the second one matches 2 patterns so it should win.
      const rules: readonly DetectRule[] = [
        { dependencies: ['react'] },
        { dependencies: ['react'], files: ['src-tauri/'] },
      ];
      const result = evaluateDetects(
        rules,
        inspect({ dependencies: ['react'], files: ['src-tauri'] }),
      );
      expect(result).toEqual({ matched: true, specificity: 2 });
    });

    it('returns unmatched when none of the rules match', () => {
      const rules: readonly DetectRule[] = [{ dependencies: ['react'] }, { files: ['Cargo.toml'] }];
      expect(evaluateDetects(rules, inspect({ files: ['package.json'] }))).toEqual({
        matched: false,
        specificity: 0,
      });
    });
  });
});
