import { vi, beforeAll, afterAll } from 'vitest';

// Minimal setup for auth tests - no expo dependencies needed
// The auth.test.ts file mocks everything it needs inline

// Suppress console noise in tests
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  console.error = vi.fn();
  console.warn = vi.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});
