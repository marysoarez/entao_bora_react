import { describe, expect, it } from "vitest";
import { canDeliverNotification, notificationPolicy } from "./notification";

const preferences = { events: true, orders: true, marketing: false };

describe("notification policy", () => {
  it("separates transactional messages from marketing", () => {
    expect(notificationPolicy("order_ready").kind).toBe("transactional");
    expect(notificationPolicy("event_reminder").kind).toBe("transactional");
    expect(notificationPolicy("event_created").kind).toBe("marketing");
    expect(notificationPolicy("place_campaign").kind).toBe("marketing");
  });

  it("requires global consent, topic preference and contextual relationship", () => {
    expect(
      canDeliverNotification({
        type: "order_ready",
        notificationsEnabled: true,
        preferences,
      }),
    ).toBe(false);
    expect(
      canDeliverNotification({
        type: "order_ready",
        notificationsEnabled: true,
        preferences,
        hasRelationship: true,
      }),
    ).toBe(true);
    expect(
      canDeliverNotification({
        type: "event_nearby",
        notificationsEnabled: true,
        preferences,
      }),
    ).toBe(false);
    expect(
      canDeliverNotification({
        type: "event_nearby",
        notificationsEnabled: true,
        preferences: { ...preferences, marketing: true },
      }),
    ).toBe(true);
    expect(
      canDeliverNotification({
        type: "place_news",
        notificationsEnabled: false,
        preferences: { ...preferences, marketing: true },
      }),
    ).toBe(false);
  });
});
