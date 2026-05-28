import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// With `globals: false`, RTL's auto-cleanup hook is not registered, so DOM
// from one test leaks into the next. Wire it up explicitly.
afterEach(() => {
  cleanup();
});
