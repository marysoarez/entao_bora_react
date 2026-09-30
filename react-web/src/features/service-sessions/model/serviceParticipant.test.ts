import { expect, it } from "vitest";
import { validateServiceParticipant } from "./serviceParticipant";

const participant = { userId: "mary", placeId: "one", serviceSessionId: "ABC", source: "customer_qr" as const, leftAt: null };

it("accepts one participant without making the session depend on that user", () => {
  expect(validateServiceParticipant(participant)).toEqual(participant);
});

it.each([
  { ...participant, userId: "" },
  { ...participant, placeId: "places/one" },
  { ...participant, serviceSessionId: "sessions/ABC" },
  { ...participant, source: "unknown" as never },
  { ...participant, leftAt: new Date() },
])("rejects invalid participant data", value => {
  expect(() => validateServiceParticipant(value)).toThrow();
});
