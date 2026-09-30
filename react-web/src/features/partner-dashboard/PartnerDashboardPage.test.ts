import { describe, expect, it } from "vitest";
import type { Event } from "../../shared/models";
import { eventsForPlace } from "./PartnerDashboardPage";

describe("painel de gestão do estabelecimento", () => {
  it("inclui avulsos em todas as seleções e exclui os vinculados a outro local", () => {
    const events = [
      { id: "event-1", placeId: "place-1" },
      { id: "event-2", placeId: "place-2" },
      { id: "event-3", placeId: "place-1" },
      { id: "event-without-place", placeId: null },
      { id: "empty", placeId: "" },
      { id: "spaces", placeId: "   " },
    ] as Event[];

    expect(eventsForPlace(events, "place-1").map((event) => event.id)).toEqual([
      "event-1",
      "event-3",
      "event-without-place",
      "empty",
      "spaces",
    ]);
    expect(eventsForPlace(events, "place-2").map((event) => event.id)).toEqual([
      "event-2",
      "event-without-place",
      "empty",
      "spaces",
    ]);
    expect(eventsForPlace(events, null)).toEqual(events);
    expect(eventsForPlace(events, undefined)).toEqual(events);
  });
});
