import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSearchText,
  searchGrams,
} from "./transferRecipientSearch.js";

test("search index normalizes names and email tokens", () => {
  const profile = {
    name: "Lucía Pereira",
    email: "lucia@example.com",
  };
  assert.equal(normalizeSearchText("  LÚCIA "), "lucia");
  assert.ok(searchGrams(profile.name, profile.email).includes("cia"));
  assert.ok(searchGrams(profile.name, profile.email).includes("exa"));
});
