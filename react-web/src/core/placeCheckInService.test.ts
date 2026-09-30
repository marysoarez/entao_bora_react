import { beforeEach, expect, it, vi } from "vitest";
import { mergeCheckInSources, validAutoCheckinSettings } from "../shared/checkIn";
const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), update: vi.fn() }));
vi.mock("./firebase", () => ({ database: () => ({}), assertProductWritesEnabled: vi.fn() }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/"), id: parts.at(-1) }),
  serverTimestamp: () => "server-time",
  runTransaction: (_db: unknown, callback: (tx: unknown) => unknown) => callback(mocks),
}));
import { checkIntoPlace } from "./placeCheckInService";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockImplementation(async (ref: { path: string }) => ({ exists: () => ref.path === "places/p" }));
});
it("creates only a deterministic presence document", async () => {
  await checkIntoPlace("p", "u", "manual");
  expect(mocks.set).toHaveBeenCalledExactlyOnceWith({ path: "places/p/checkins/u", id: "u" }, {
    userId: "u", placeId: "p", source: "manual", sources: ["manual"], checkedInAt: "server-time", checkedOutAt: null,
  });
  expect(mocks.update).not.toHaveBeenCalled();
});
it("reuses geofence presence for QR and preserves initial time and origin", async () => {
  mocks.get.mockResolvedValue({ exists: () => true, data: () => ({ userId: "u", placeId: "p", source: "geofence", sources: ["geofence"], checkedOutAt: null }) });
  expect(await checkIntoPlace("p", "u", "qr")).toEqual({ id: "u", reused: true });
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ path: "places/p/checkins/u", id: "u" }, { sources: ["geofence", "qr"] });
  expect(mocks.set).not.toHaveBeenCalled();
});
it("repeated source does not write", async () => {
  mocks.get.mockResolvedValue({ exists: () => true, data: () => ({ userId: "u", placeId: "p", source: "manual", sources: ["manual"], checkedOutAt: null }) });
  await checkIntoPlace("p", "u", "manual");
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.set).not.toHaveBeenCalled();
});
it("blocks browser geofence and missing places", async () => {
  await expect(checkIntoPlace("p", "u", "geofence")).rejects.toThrow("mobile");
  await expect(checkIntoPlace("missing", "u", "manual")).rejects.toThrow("não encontrado");
  expect(mocks.set).not.toHaveBeenCalled();
});
it("does not overwrite closed visits", async () => {
  mocks.get.mockResolvedValue({ exists: () => true, data: () => ({ checkedOutAt: new Date() }) });
  await expect(checkIntoPlace("p", "u", "manual")).rejects.toThrow("Reabertura");
  expect(mocks.set).not.toHaveBeenCalled();
});
it("all origins complement the same context", () => {
  expect(mergeCheckInSources(mergeCheckInSources(["geofence"], "qr"), "manual")).toEqual(["geofence", "qr", "manual"]);
});
it("settings have no defaults and reject duplicated coordinates and invalid values", () => {
  expect(validAutoCheckinSettings({})).toBe(true);
  expect(validAutoCheckinSettings({ autoCheckinEnabled: false, radiusMeters: 150, minimumStayMinutes: 5 })).toBe(true);
  for (const value of [{ latitude: 1 }, { radiusMeters: 0 }, { minimumStayMinutes: -1 }, { radiusMeters: Infinity }, { autoCheckinEnabled: "true" }])
    expect(validAutoCheckinSettings(value)).toBe(false);
});
