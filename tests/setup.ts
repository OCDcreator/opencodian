/**
 * Test setup file
 */

// Mock Obsidian API globals
global.document = document;
global.window = window;

// Silence console warnings during tests
const originalConsoleWarn = console.warn;
console.warn = (...args: unknown[]) => {
  // Filter out specific warnings if needed
  originalConsoleWarn.apply(console, args);
};
