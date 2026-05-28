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
              name: 'react-native',
              extends: ['base'],
              agents: ['docs-manager', 'pr-creator'],
              skills: [],
              commands: [],
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
          presets: [
            {
              name: 'bare',
              extends: [],
              agents: [],
              skills: [],
              commands: [],
              instructions: [],
            },
          ],
        }}
      />,
    );
    expect(screen.getByText('empty')).toBeInTheDocument();
  });
});
