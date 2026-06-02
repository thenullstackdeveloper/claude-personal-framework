import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CliError } from '../lib/api';
import { InitReport } from './init-report';

const sampleData = {
  presetName: 'react-native',
  manifestPath: '/tmp/proj/.claude-fw.yaml',
};

describe('<InitReport />', () => {
  describe('success', () => {
    it('renders preset name and manifest path', () => {
      render(<InitReport status="success" data={sampleData} onDismiss={() => {}} />);
      expect(screen.getByText(/Project initialized/)).toBeInTheDocument();
      expect(screen.getByText('react-native')).toBeInTheDocument();
      expect(screen.getByText('/tmp/proj/.claude-fw.yaml')).toBeInTheDocument();
      expect(screen.getByText(/You can install now/)).toBeInTheDocument();
    });

    it('renders nothing when status=success but no data provided', () => {
      const { container } = render(<InitReport status="success" onDismiss={() => {}} />);
      expect(container).toBeEmptyDOMElement();
    });

    it('invokes onDismiss when the Dismiss button is clicked', async () => {
      const onDismiss = vi.fn();
      const user = userEvent.setup();
      render(<InitReport status="success" data={sampleData} onDismiss={onDismiss} />);
      await user.click(screen.getByRole('button', { name: /dismiss/i }));
      expect(onDismiss).toHaveBeenCalledOnce();
    });
  });

  describe('error', () => {
    it('renders the error message when status is error', () => {
      const error: CliError = { code: 'MANIFEST_ALREADY_EXISTS', message: 'already there' };
      render(<InitReport status="error" error={error} onDismiss={() => {}} />);
      expect(screen.getByText(/Initialize failed/)).toBeInTheDocument();
      expect(screen.getByText(/already there/)).toBeInTheDocument();
    });

    it('falls back to "Unknown error" if error prop is missing', () => {
      render(<InitReport status="error" onDismiss={() => {}} />);
      expect(screen.getByText(/Unknown error/)).toBeInTheDocument();
    });

    it('invokes onDismiss when the Dismiss button is clicked on error', async () => {
      const onDismiss = vi.fn();
      const user = userEvent.setup();
      render(
        <InitReport status="error" error={{ code: 'X', message: 'fail' }} onDismiss={onDismiss} />,
      );
      await user.click(screen.getByRole('button', { name: /dismiss/i }));
      expect(onDismiss).toHaveBeenCalledOnce();
    });
  });
});
