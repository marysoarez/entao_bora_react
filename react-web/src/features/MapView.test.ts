import { afterEach, beforeEach, expect, it, vi } from "vitest";

let scripts: any[];
let browser: any;

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "test-key");
  scripts = [];
  browser = {};
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", {
    createElement: () => ({ remove: vi.fn() }),
    head: { appendChild: (script: any) => scripts.push(script) },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("waits for API readiness even when the script has already loaded", async () => {
  const { loadMaps } = await import("./MapView");
  const promise = loadMaps();
  expect(loadMaps()).toBe(promise);
  expect(scripts).toHaveLength(1);
  let resolved = false;
  void promise.then(() => { resolved = true; });
  browser.google = { maps: {} };
  scripts[0].onload?.();
  await Promise.resolve();
  expect(resolved).toBe(false);
  browser.google.maps.Map = class {};
  const callback = new URL(scripts[0].src).searchParams.get("callback")!;
  browser[callback]();
  await expect(promise).resolves.toBe(browser.google.maps);
  expect(vi.getTimerCount()).toBe(0);
});

it("allows another attempt after a network failure", async () => {
  const { loadMaps } = await import("./MapView");
  const promise = loadMaps();
  scripts[0].onerror();
  await expect(promise).rejects.toThrow("Tente novamente");
  expect(scripts[0].remove).toHaveBeenCalled();
  const retry = loadMaps();
  expect(scripts).toHaveLength(2);
  browser.google = { maps: { Map: class {} } };
  browser.__entaoBoraMapsReady();
  await expect(retry).resolves.toBe(browser.google.maps);
});

it("stops waiting when the API never becomes ready", async () => {
  const { loadMaps } = await import("./MapView");
  const result = expect(loadMaps()).rejects.toThrow("Tente novamente");
  await vi.advanceTimersByTimeAsync(30000);
  await result;
  expect(scripts[0].remove).toHaveBeenCalled();
});
