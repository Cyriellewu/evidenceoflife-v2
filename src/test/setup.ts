import "@testing-library/jest-dom";

// Newer Node versions expose an incomplete global localStorage unless a backing
// file is configured. Give Supabase a complete in-memory Storage implementation.
const localValues = new Map<string, string>();
const testLocalStorage: Storage = {
  get length() { return localValues.size; },
  clear: () => localValues.clear(),
  getItem: key => localValues.get(key) ?? null,
  key: index => [...localValues.keys()][index] ?? null,
  removeItem: key => { localValues.delete(key); },
  setItem: (key, value) => { localValues.set(key, String(value)); },
};
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: testLocalStorage,
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
