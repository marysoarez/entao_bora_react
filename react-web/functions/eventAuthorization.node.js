import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { getFirestore } from "firebase-admin/firestore";
import { deleteApp, getApps } from "firebase-admin/app";

// Admin SDK bypasses rules: always exercise these handlers in an isolated local project.
const host = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8187";
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host))
  throw Error("Use um emulador local.");
process.env.FIRESTORE_EMULATOR_HOST = host;
process.env.GCLOUD_PROJECT = "demo-entao-bora-event-functions";
const functions = await import("./index.js");
const db = getFirestore();
const eventRef = db.doc("events/existing");
const original = {
  createdBy: "creator",
  title: "Original",
  featured: false,
  views: 4,
};
const features = Object.fromEntries(
  [
    "notifications",
    "tables",
    "orders",
    "inventory",
    "purchases",
    "advancedAnalytics",
  ].map((key) => [key, true]),
);
const entitlement = {
  placeId: "place",
  planKey: "full",
  status: "active",
  features,
  validUntil: null,
};
beforeEach(async () => {
  await Promise.all([
    eventRef.set(original),
    db.doc("users/admin").set({ role: "admin", active: true }),
    db.doc("users/creator").set({ role: "user", active: true }),
    db.doc("users/partner").set({ role: "partner", active: true }),
    db.doc("places/place").set({ ownerId: "partner" }),
  ]);
});
after(async () => {
  await db.terminate();
  await Promise.all(getApps().map(deleteApp));
});

test("backend has no callable for event editing or ownership transfer", () => {
  const callables = Object.entries(functions)
    .filter(([, handler]) => handler.__endpoint?.callableTrigger)
    .map(([name]) => name)
    .sort();
  assert.deepEqual(callables, [
    "adminUpdatePlaceEntitlements",
    "adminUpdateUser",
  ]);
});

test("existing admin handlers reject unauthenticated users, authors and partners", async () => {
  for (const uid of [null, "creator", "partner"]) {
    for (const [handler, data] of [
      [
        functions.adminUpdateUser,
        {
          uid: "creator",
          role: "admin",
          active: true,
          confirmation: "creator",
        },
      ],
      [functions.adminUpdatePlaceEntitlements, entitlement],
    ]) {
      await assert.rejects(handler.run({ auth: uid ? { uid } : null, data }), {
        code: uid ? "permission-denied" : "unauthenticated",
      });
    }
  }
  assert.deepEqual((await eventRef.get()).data(), original);
});

test("admin endpoints cannot be redirected to events or accept injected ownership fields", async () => {
  for (const value of ["events/existing", "../events/existing"]) {
    await assert.rejects(
      functions.adminUpdateUser.run({
        auth: { uid: "admin" },
        data: { uid: value, role: "user", active: true, confirmation: value },
      }),
      { code: "invalid-argument" },
    );
    await assert.rejects(
      functions.adminUpdatePlaceEntitlements.run({
        auth: { uid: "admin" },
        data: { ...entitlement, placeId: value },
      }),
      { code: "invalid-argument" },
    );
  }
  await functions.adminUpdateUser.run({
    auth: { uid: "admin" },
    data: {
      uid: "creator",
      role: "user",
      active: true,
      confirmation: "creator",
      eventId: "existing",
      createdBy: "admin",
      featured: true,
    },
  });
  await functions.adminUpdatePlaceEntitlements.run({
    auth: { uid: "admin" },
    data: {
      ...entitlement,
      eventId: "existing",
      createdBy: "admin",
      title: "Injected",
    },
  });
  assert.equal(
    (await db.doc("places/place/settings/entitlements").get()).get("planKey"),
    "full",
  );
  assert.equal((await db.doc("users/creator").get()).get("role"), "user");
  assert.deepEqual((await eventRef.get()).data(), original);
});
