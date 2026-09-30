import type { Event } from "../shared/models";

export function boraHeatPoints(events: Event[]) {
  const points = events.flatMap(({ address, boraCount }) => {
    const { latitude: lat, longitude: lng } = address;
    return Number.isFinite(lat) && Math.abs(lat) <= 90 &&
      Number.isFinite(lng) && Math.abs(lng) <= 180 &&
      Number.isFinite(boraCount) && boraCount > 0
      ? [{ lat, lng, weight: boraCount }]
      : [];
  });
  const grouped = new Map<string, typeof points[number]>();
  for (const point of points) {
    const key = `${point.lat},${point.lng}`;
    const existing = grouped.get(key);
    if (existing) existing.weight += point.weight;
    else grouped.set(key, { ...point });
  }
  return [...grouped.values()];
}

export const boraHeatBands = [
  { min: 1, label: "1–9", color: [37, 99, 235] },
  { min: 10, label: "10–49", color: [0, 210, 210] },
  { min: 50, label: "50–99", color: [255, 220, 0] },
  { min: 100, label: "100+", color: [239, 45, 35] },
];

// A point has one hue. Distance changes opacity only; overlaps are not blended.
export function heatPixels(width: number, height: number,
  points: { x: number; y: number; weight: number }[], radius: number) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const strength = new Float32Array(width * height);
  for (const { x, y, weight } of points) {
    const color = [...boraHeatBands].reverse().find((band) => weight >= band.min)!.color;
    for (let py = Math.max(0, Math.floor(y - radius)); py < Math.min(height, y + radius); py++) {
      for (let px = Math.max(0, Math.floor(x - radius)); px < Math.min(width, x + radius); px++) {
        const distance = ((px - x) ** 2 + (py - y) ** 2) / radius ** 2;
        if (distance >= 1) continue;
        const opacity = (1 - distance) ** 2;
        const index = py * width + px;
        if (opacity <= strength[index]) continue;
        strength[index] = opacity;
        pixels.set([...color, Math.round(190 * opacity)], index * 4);
      }
    }
  }
  return pixels;
}

export function createBoraHeatmap(maps: any, map: any, events: Event[]) {
  const points = boraHeatPoints(events);
  // Render at quarter resolution, then interpolate for soft edges on mobile too.
  const scale = 4;
  const radius = 25;
  class BoraHeatmap extends maps.OverlayView {
    canvas = document.createElement("canvas");
    resize?: ResizeObserver;
    onAdd() {
      this.canvas.style.cssText = "position:absolute;pointer-events:none;";
      this.canvas.setAttribute("aria-hidden", "true");
      this.getPanes().overlayLayer.appendChild(this.canvas);
      this.resize = new ResizeObserver(() => this.draw());
      this.resize.observe(map.getDiv());
    }
    draw() {
      const projection = this.getProjection();
      const center = map.getCenter();
      if (!projection || !center) return;
      const pixel = projection.fromLatLngToDivPixel(center);
      if (!pixel) return;
      const width = map.getDiv().clientWidth + radius * 2;
      const height = map.getDiv().clientHeight + radius * 2;
      const left = pixel.x - width / 2;
      const top = pixel.y - height / 2;
      Object.assign(this.canvas.style, {
        left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`,
      });
      this.canvas.width = Math.ceil(width / scale);
      this.canvas.height = Math.ceil(height / scale);
      const context = this.canvas.getContext("2d");
      if (!context) return;
      const projected = points.flatMap((point) => {
        const pixel = projection.fromLatLngToDivPixel(new maps.LatLng(point.lat, point.lng));
        return pixel ? [{ x: (pixel.x - left) / scale, y: (pixel.y - top) / scale, weight: point.weight }] : [];
      });
      const pixels = context.createImageData(this.canvas.width, this.canvas.height);
      pixels.data.set(heatPixels(this.canvas.width, this.canvas.height, projected, radius / scale));
      context.putImageData(pixels, 0, 0);
    }
    onRemove() {
      this.resize?.disconnect();
      this.canvas.remove();
    }
  }
  const overlay = new BoraHeatmap();
  overlay.setMap(map);
  return overlay;
}
