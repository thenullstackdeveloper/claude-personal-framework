import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CatalogReport } from '../lib/api';
import { CatalogView } from './catalog-view';

const emptyReport: CatalogReport = {
  presets: [],
  agents: [],
  skills: [],
  commands: [],
  instructions: [],
  gitHooks: [],
};

const emptyPreset = {
  name: '',
  extends: [] as readonly string[],
  agents: [] as readonly string[],
  skills: [] as readonly string[],
  commands: [] as readonly string[],
  instructions: [] as readonly string[],
  gitHooks: [] as readonly string[],
};

describe('<CatalogView />', () => {
  it('renders the Instructions card even when empty', () => {
    render(<CatalogView report={emptyReport} />);
    expect(screen.getByRole('heading', { name: /instructions/i })).toBeInTheDocument();
    expect(screen.getByText(/No instructions in the catalog/)).toBeInTheDocument();
  });

  it('lists instructions with their description', () => {
    render(
      <CatalogView
        report={{
          ...emptyReport,
          instructions: [
            { id: 'intro', description: '' },
            { id: 'conventions', description: 'Coding rules' },
          ],
        }}
      />,
    );
    expect(screen.getByText('intro')).toBeInTheDocument();
    expect(screen.getByText('conventions')).toBeInTheDocument();
    expect(screen.getByText('Coding rules')).toBeInTheDocument();
  });

  it('includes the instruction count in the preset summary', () => {
    render(
      <CatalogView
        report={{
          ...emptyReport,
          presets: [
            {
              ...emptyPreset,
              name: 'react-native',
              extends: ['base'],
              agents: ['docs-manager', 'pr-creator'],
              instructions: ['intro', 'conventions'],
            },
          ],
        }}
      />,
    );
    expect(screen.getByText('2 agents, 2 instructions')).toBeInTheDocument();
  });

  it('says "empty" when a preset has no artifacts at all', () => {
    render(
      <CatalogView
        report={{
          ...emptyReport,
          presets: [{ ...emptyPreset, name: 'bare' }],
        }}
      />,
    );
    expect(screen.getByText('empty')).toBeInTheDocument();
  });

  it('renders the Git hooks card even when empty', () => {
    render(<CatalogView report={emptyReport} />);
    expect(screen.getByRole('heading', { name: /git hooks/i })).toBeInTheDocument();
    expect(screen.getByText(/No git-hooks in the catalog/)).toBeInTheDocument();
  });

  it('lists git hooks by name', () => {
    render(
      <CatalogView
        report={{
          ...emptyReport,
          gitHooks: [{ hookName: 'commit-msg' }, { hookName: 'pre-commit' }],
        }}
      />,
    );
    expect(screen.getByText('commit-msg')).toBeInTheDocument();
    expect(screen.getByText('pre-commit')).toBeInTheDocument();
  });

  it('includes the git-hooks count in the preset summary', () => {
    render(
      <CatalogView
        report={{
          ...emptyReport,
          presets: [
            {
              ...emptyPreset,
              name: 'base',
              gitHooks: ['commit-msg', 'pre-commit', 'pre-push'],
            },
          ],
        }}
      />,
    );
    expect(screen.getByText('3 git-hooks')).toBeInTheDocument();
  });
});
