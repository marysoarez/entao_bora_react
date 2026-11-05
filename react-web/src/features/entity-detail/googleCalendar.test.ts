import { describe, expect, it } from "vitest";
import { googleCalendarUrl } from "./googleCalendar";
import type { Event } from "../../shared/models";

describe("googleCalendarUrl", () => {
  it("creates a Google Calendar template with event details and UTC dates", () => {
    const event = {
      id: "evento-1",
      slug: "show-rock",
      title: "Rock & Blues",
      description: "Um show especial",
      startDate: new Date("2026-11-05T22:00:00.000Z"),
      endDate: new Date("2026-11-06T02:00:00.000Z"),
      locationName: "Casa de Shows",
      address: { displayName: "Rua das Flores, 10" },
    } as Event;

    const url = new URL(googleCalendarUrl(event));

    expect(url.origin + url.pathname).toBe(
      "https://calendar.google.com/calendar/render",
    );
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe(event.title);
    expect(url.searchParams.get("dates")).toBe(
      "20261105T220000Z/20261106T020000Z",
    );
    expect(url.searchParams.get("details")).toContain(event.description);
    expect(url.searchParams.get("details")).toContain(
      "https://entaobora.com.br/events/show-rock",
    );
    expect(url.searchParams.get("location")).toBe(event.locationName);
  });
});
