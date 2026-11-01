import test from "node:test";
import assert from "node:assert/strict";
import {
  canTransferEvent,
  makeRecipient,
  normalizeSearchText,
  recipientMatches,
  searchGrams,
} from "./transferRecipientSearch.js";

test("search matches name and email substrings without case or accent sensitivity", () => {
  const profile = {
    id: "target", active: true, role: "user", name: "Lucía Pereira",
    email: "lucia@example.com",
  };
  assert.equal(recipientMatches(profile, "target", "actor", "Cia Per"), true);
  assert.equal(recipientMatches(profile, "target", "actor", "EXAMPLE"), true);
  assert.equal(normalizeSearchText("  LÚCIA "), "lucia");
  assert.ok(searchGrams(profile.name, profile.email).includes("cia"));
});

test("recipient search excludes self and invalid or inactive profiles", () => {
  const base = { id: "target", active: true, role: "user", name: "Alex Silva", email: null };
  assert.equal(recipientMatches(base, "target", "target", "Alex"), false);
  assert.equal(recipientMatches({ ...base, active: false }, "target", "actor", "Alex"), false);
  assert.equal(recipientMatches({ ...base, role: "unknown" }, "target", "actor", "Alex"), false);
  assert.equal(recipientMatches({ ...base, id: "wrong" }, "target", "actor", "Alex"), false);
  assert.equal(recipientMatches(base, "target", "actor", "Missing"), false);
});

test("only admins, event owners, and linked-place owners can search transfer recipients", () => {
  const event = { createdBy: "partner", placeId: "place" };
  const place = { id: "place", ownerId: "place-owner" };
  assert.equal(canTransferEvent({ uid: "admin", role: "admin", active: true }, event, null, null), true);
  assert.equal(canTransferEvent({ uid: "partner", role: "partner", active: true }, event, place, null), true);
  assert.equal(canTransferEvent({ uid: "manager", role: "partner", active: true }, event, place, {
    uid: "manager", placeId: "place", role: "manager", active: true,
  }), false);
  assert.equal(canTransferEvent({ uid: "other", role: "user", active: true }, event, place, null), false);
  assert.equal(canTransferEvent({ uid: "partner", role: "partner", active: false }, event, place, null), false);
});

test("returned recipient contains only id, name, and email", () => {
  assert.deepEqual(makeRecipient({ name: " Alex ", email: " alex@example.com ", photoUrl: "private" }, "uid"), {
    id: "uid", name: "Alex", email: "alex@example.com",
  });
});
