import { describe, expect, it } from "vitest";
import { parseEvent, parseUser } from "./domain";
import { canEditEvent } from "./eventPermissions";

describe("event authorship", () => {
  it.each(["user", "partner", "admin"])(
    "only the %s author may edit",
    (role) => {
      const user = parseUser("uid", { role, partnerId: "legacy-partner" });
      expect(canEditEvent(user, { createdBy: "uid" })).toBe(true);
      expect(canEditEvent(user, { createdBy: "other" })).toBe(false);
      expect(canEditEvent(user, { createdBy: "legacy-partner" })).toBe(false);
      expect(canEditEvent(user, { createdBy: "" })).toBe(false);
    },
  );
  it("requires a session with a nonempty UID", () => {
    expect(canEditEvent(null, { createdBy: "uid" })).toBe(false);
    expect(canEditEvent(parseUser("", {}), { createdBy: "" })).toBe(false);
  });
  it("preserves normalized legacy authorship", () => {
    const event = parseEvent("event", { createdBy: { id: "uid" } });
    expect(canEditEvent(parseUser("uid", {}), event)).toBe(true);
  });
});
