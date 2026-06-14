import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecentProject } from '../hooks/use-recent-projects';
import { ProjectHeader } from './project-header';

const baseProps = () => ({
  activeProject: { path: '/home/angel/Projects/my-app' },
  presetName: 'tauri-rust-react',
  recent: [] as readonly RecentProject[],
  onSelectRecent: vi.fn(),
  onBrowse: vi.fn(),
  onNewProject: vi.fn(),
  onSettings: vi.fn(),
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-14T10:00:00Z'));
});

describe('ProjectHeader', () => {
  it('renders project basename, full path and preset name', () => {
    render(<ProjectHeader {...baseProps()} />);
    expect(screen.getByText('my-app')).toBeInTheDocument();
    expect(screen.getByText('/home/angel/Projects/my-app')).toBeInTheDocument();
    expect(screen.getByText('tauri-rust-react')).toBeInTheDocument();
  });

  it('falls back to a hint when there is no preset yet', () => {
    render(<ProjectHeader {...baseProps()} presetName={null} />);
    expect(screen.getByText(/no preset yet/i)).toBeInTheDocument();
  });

  it('renders the Settings button with the icon + label per D4', () => {
    const onSettings = vi.fn();
    render(<ProjectHeader {...baseProps()} onSettings={onSettings} />);
    const settings = screen.getByRole('button', { name: /settings/i });
    fireEvent.click(settings);
    expect(onSettings).toHaveBeenCalledOnce();
  });
});

describe('SwitchProjectDropdown (via ProjectHeader)', () => {
  it('does not render the menu until the Switch button is clicked', () => {
    render(<ProjectHeader {...baseProps()} />);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens and closes the menu when toggling the Switch button', () => {
    render(<ProjectHeader {...baseProps()} />);
    const trigger = screen.getByRole('button', { name: /switch project/i });
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('lists recent projects with basename, full path and preset name', () => {
    const recent: readonly RecentProject[] = [
      {
        path: '/home/angel/api-backend',
        presetName: 'nestjs',
        lastUsed: '2026-06-14T09:30:00.000Z',
      },
    ];
    render(<ProjectHeader {...baseProps()} recent={recent} />);
    fireEvent.click(screen.getByRole('button', { name: /switch project/i }));
    expect(screen.getByText('api-backend')).toBeInTheDocument();
    expect(screen.getByText('/home/angel/api-backend')).toBeInTheDocument();
    expect(screen.getByText(/nestjs · 30 min ago/)).toBeInTheDocument();
  });

  it('omits the "Recent" header when the list is empty', () => {
    render(<ProjectHeader {...baseProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /switch project/i }));
    expect(screen.queryByText(/^recent$/i)).not.toBeInTheDocument();
  });

  it('calls onSelectRecent and closes when a recent entry is clicked', () => {
    const recent: readonly RecentProject[] = [
      { path: '/proj', presetName: 'base', lastUsed: '2026-06-14T09:00:00.000Z' },
    ];
    const onSelectRecent = vi.fn();
    render(<ProjectHeader {...baseProps()} recent={recent} onSelectRecent={onSelectRecent} />);
    fireEvent.click(screen.getByRole('button', { name: /switch project/i }));
    fireEvent.click(screen.getByText('proj'));
    expect(onSelectRecent).toHaveBeenCalledWith(recent[0]);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('calls onBrowse and closes when Browse… is clicked', () => {
    const onBrowse = vi.fn();
    render(<ProjectHeader {...baseProps()} onBrowse={onBrowse} />);
    fireEvent.click(screen.getByRole('button', { name: /switch project/i }));
    fireEvent.click(screen.getByText(/browse/i));
    expect(onBrowse).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('calls onNewProject and closes when New project is clicked', () => {
    const onNewProject = vi.fn();
    render(<ProjectHeader {...baseProps()} onNewProject={onNewProject} />);
    fireEvent.click(screen.getByRole('button', { name: /switch project/i }));
    fireEvent.click(screen.getByText(/new project/i));
    expect(onNewProject).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the menu on Escape', () => {
    render(<ProjectHeader {...baseProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /switch project/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the menu on mousedown outside the wrapper', () => {
    render(
      <>
        <ProjectHeader {...baseProps()} />
        <div data-testid="outside">outside</div>
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: /switch project/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
