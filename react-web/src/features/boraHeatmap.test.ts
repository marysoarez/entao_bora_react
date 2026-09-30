import { expect, it, vi } from "vitest";
import type { Event } from "../shared/models";
import { boraHeatPoints, createBoraHeatmap, heatPixels } from "./boraHeatmap";

const event = (boraCount: number, placeId: string | null = null, latitude = -22) =>
  ({ boraCount, placeId, address: { latitude, longitude: -43 } }) as Event;

it("includes linked and independent events, ignoring zero/invalid counts and coordinates", () => {
  expect(boraHeatPoints([
    event(8, "venue"), event(2), event(0), event(-2), event(NaN), event(5, null, 100),
  ])).toEqual([
    { lat: -22, lng: -43, weight: 10 },
  ]);
});

it("keeps the same hue at the center and edges, with colors based on counts", () => {
  const pixels = heatPixels(40, 12, [
    { x: 5, y: 5, weight: 2 }, { x: 20, y: 5, weight: 100 },
  ], 4);
  const rgb = (x: number) => [...pixels.slice((5 * 40 + x) * 4, (5 * 40 + x) * 4 + 3)];
  expect(rgb(5)).toEqual([37, 99, 235]);
  expect(rgb(7)).toEqual(rgb(5));
  expect(rgb(20)).toEqual([239, 45, 35]);
  expect(rgb(22)).toEqual(rgb(20));
  expect(pixels[(5 * 40 + 22) * 4 + 3]).toBeLessThan(pixels[(5 * 40 + 20) * 4 + 3]);
  expect(heatPixels(3, 3, [], 4).every((value) => value === 0)).toBe(true);
});

it("keeps heat below markers without intercepting clicks and cleans up on removal", () => {
  const context = {
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: vi.fn(),
  };
  const canvas = { style: {}, setAttribute: vi.fn(), getContext: () => context, remove: vi.fn(), width: 0, height: 0 };
  const appendChild = vi.fn();
  const disconnect = vi.fn();
  vi.stubGlobal("document", { createElement: () => canvas });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect = disconnect; });
  class OverlayView {
    setMap(map: unknown) { if (map) { (this as any).onAdd(); (this as any).draw(); } else (this as any).onRemove(); }
    getPanes() { return { overlayLayer: { appendChild } }; }
    getProjection() { return { fromLatLngToDivPixel: () => ({ x: 50, y: 50 }) }; }
  }
  try {
    const overlay = createBoraHeatmap({ OverlayView, LatLng: class {} }, {
      getCenter: () => ({}), getDiv: () => ({ clientWidth: 100, clientHeight: 100 }),
    }, [event(10)]);
    expect(appendChild).toHaveBeenCalledWith(canvas);
    expect((canvas.style as any).cssText).toContain("pointer-events:none");
    expect(context.putImageData).toHaveBeenCalled();
    overlay.setMap(null);
    expect(disconnect).toHaveBeenCalled();
    expect(canvas.remove).toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});
