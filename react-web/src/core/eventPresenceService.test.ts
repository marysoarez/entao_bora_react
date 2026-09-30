import { beforeEach, expect, it, vi } from "vitest";
import { parseEvent } from "../shared/domain";
import { eventPresenceContexts } from "../shared/eventPresence";
import type { CheckIn } from "../shared/checkIn";

const mocks = vi.hoisted(() => ({ getDoc: vi.fn(), getDocs: vi.fn() }));
vi.mock("./firebase", () => ({ database: () => ({}) }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...path: string[]) => path.join("/"),
  collection: (_db: unknown, path: string) => path,
  query: (ref: unknown, constraint: unknown) => ({ ref, constraint }),
  where: (field: string, op: string, value: string) => ({ field, op, value }),
  getDoc: mocks.getDoc, getDocs: mocks.getDocs,
}));
import { getEventPresenceContexts } from "./eventPresenceService";
const start = new Date("2026-09-25T20:00:00Z");
const now = new Date("2026-09-25T21:00:00Z");
const end = new Date("2026-09-25T22:00:00Z");
const presence: CheckIn = { userId: "u", placeId: "p", source: "qr", sources: ["qr"], checkedInAt: start, checkedOutAt: null };
const event = parseEvent("e", { placeId: "p", status: "published", startDate: start, endDate: end });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ ...presence, checkedInAt: { toDate: () => start } }) });
  mocks.getDocs.mockResolvedValue({ docs: [{ id: "e", data: () => event }] });
});
it("relates the existing user/place/event without confirming participation or modifying inputs", () => {
  const before = structuredClone(event);
  expect(eventPresenceContexts(presence, [event], now)).toEqual([{
    userId: "u", placeId: "p", eventId: "e", checkedInAt: start, source: "qr", participation: "unconfirmed",
  }]);
  expect(event).toEqual(before);
});
it("rejects other places, unlinked events, invalid dates and unpublished events", () => {
  for (const change of [{ placeId: "other" }, { placeId: null }, { status: "cancelled" as const },
    { status: "draft" as const }, { status: "hidden" as const }, { status: "finished" as const },
    { startDate: new Date(NaN) }, { endDate: start }, { endDate: new Date(NaN) }])
    expect(eventPresenceContexts(presence, [{ ...event, ...change }], now)).toEqual([]);
});
it("excludes old open visits, future arrivals, checkout and invalid observation time", () => {
  for (const change of [{ checkedInAt: new Date(start.getTime() - 1) }, { checkedInAt: end },
    { checkedOutAt: now }, { checkedInAt: new Date(NaN) }])
    expect(eventPresenceContexts({ ...presence, ...change }, [event], now)).toEqual([]);
  expect(eventPresenceContexts(presence, [event], new Date(NaN))).toEqual([]);
  expect(eventPresenceContexts(presence, [event], end)).toEqual([]);
  expect(eventPresenceContexts(presence, [event], start)).toHaveLength(1);
});
it("keeps simultaneous events unconfirmed and deduplicates IDs", () => {
  expect(eventPresenceContexts(presence, [event, event, { ...event, id: "e2" }], now)
    .map(context => [context.eventId, context.participation])).toEqual([["e", "unconfirmed"], ["e2", "unconfirmed"]]);
});
it("reads canonical presence and existing events through a place-scoped query", async () => {
  expect(await getEventPresenceContexts("p", "u", now)).toHaveLength(1);
  expect(mocks.getDoc).toHaveBeenCalledWith("places/p/checkins/u");
  expect(mocks.getDocs).toHaveBeenCalledWith({ ref: "events", constraint: { field: "placeId", op: "==", value: "p" } });
});
it("does not query events for missing, inconsistent, closed or malformed presence", async () => {
  mocks.getDoc.mockResolvedValueOnce({ exists: () => false });
  expect(await getEventPresenceContexts("p", "u", now)).toEqual([]);
  for (const change of [{ userId: "other" }, { placeId: "other" }, { checkedOutAt: now }, { checkedInAt: null }]) {
    mocks.getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ ...presence, checkedInAt: { toDate: () => start }, ...change }) });
    expect(await getEventPresenceContexts("p", "u", now)).toEqual([]);
  }
  expect(mocks.getDocs).not.toHaveBeenCalled();
});
it("propagates permission failures and rejects invalid paths", async () => {
  await expect(getEventPresenceContexts("p/x", "u", now)).rejects.toThrow("obrigatórios");
  mocks.getDoc.mockRejectedValueOnce(Error("permission-denied"));
  await expect(getEventPresenceContexts("p", "u", now)).rejects.toThrow("permission-denied");
  expect(mocks.getDocs).not.toHaveBeenCalled();
});
