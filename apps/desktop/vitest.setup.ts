import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// React 18+ act() needs this flag in test environments to know it's running
// inside a test. Without it `act(...)` warns "current testing environment is
// not configured to support act(...)" even when it works.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// With `globals: false`, RTL's auto-cleanup hook is not registered, so DOM
// from one test leaks into the next. Wire it up explicitly.
afterEach(() => {
  cleanup();
});
