import assert from "node:assert/strict";
import { readBrowserStorage, writeBrowserStorage } from "../lib/browser-storage";

assert.equal(readBrowserStorage("session", "seen"), null);
assert.doesNotThrow(() => writeBrowserStorage("local", "seen", "true"));
const fakeWindow = {};
Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
for (const name of ["localStorage", "sessionStorage"]) {
  Object.defineProperty(fakeWindow, name, { configurable: true, get() { throw new Error("Storage access denied"); } });
}
assert.equal(readBrowserStorage("session", "seen"), null);
assert.equal(readBrowserStorage("local", "seen"), null);
assert.doesNotThrow(() => writeBrowserStorage("session", "seen", "true"));
assert.doesNotThrow(() => writeBrowserStorage("local", "seen", "true"));
for (const name of ["localStorage", "sessionStorage"]) {
  const values = new Map<string, string>();
  Object.defineProperty(fakeWindow, name, { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } });
}
writeBrowserStorage("session", "seen", "true");
assert.equal(readBrowserStorage("session", "seen"), "true");
assert.equal(readBrowserStorage("local", "seen"), null);
Object.defineProperty(fakeWindow, "localStorage", { configurable: true, value: {
  getItem: () => null,
  setItem: () => { throw new Error("Quota exceeded"); },
} });
assert.doesNotThrow(() => writeBrowserStorage("local", "seen", "true"));
Reflect.deleteProperty(globalThis, "window");
console.log("Browser storage regression passed: SSR, denied access, isolated stores, quota failure.");
