import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

// React 18+ act() needs this flag in test environments to know it's running
// inside a test. Without it `act(...)` warns "current testing environment is
// not configured to support act(...)" even when it works.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom in this setup does not ship a usable `localStorage` (depending on the
// Node version it surfaces as undefined or an experimental stub). Install a
// trivial in-memory shim, reset per test, so usePersistedState-based hooks
// can be tested without each file having to wire its own polyfill.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
  get length(): number {
    return this.store.size;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = new MemoryStorage();
});

// With `globals: false`, RTL's auto-cleanup hook is not registered, so DOM
// from one test leaks into the next. Wire it up explicitly.
afterEach(() => {
  cleanup();
});
