/// <reference types="vite/client" />

// Ensure we're in a browser environment
declare const globalThis: typeof globalThis & {
  process?: undefined;
};
