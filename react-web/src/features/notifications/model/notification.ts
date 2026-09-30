import type { NotificationPreferences } from "../../../shared/models";

export type NotificationKind = "transactional" | "marketing";
export type NotificationTopic = "events" | "orders" | "marketing";
export type NotificationEventType =
  | "event_created"
  | "event_reminder"
  | "event_nearby"
  | "order_accepted"
  | "order_preparing"
  | "order_ready"
  | "place_campaign"
  | "place_news";

export interface NotificationPolicy {
  kind: NotificationKind;
  topic: NotificationTopic;
  requiresRelationship: boolean;
}

const policies: Record<NotificationEventType, NotificationPolicy> = {
  event_created: {
    kind: "marketing",
    topic: "marketing",
    requiresRelationship: false,
  },
  event_reminder: {
    kind: "transactional",
    topic: "events",
    requiresRelationship: true,
  },
  event_nearby: {
    kind: "marketing",
    topic: "marketing",
    requiresRelationship: false,
  },
  order_accepted: {
    kind: "transactional",
    topic: "orders",
    requiresRelationship: true,
  },
  order_preparing: {
    kind: "transactional",
    topic: "orders",
    requiresRelationship: true,
  },
  order_ready: {
    kind: "transactional",
    topic: "orders",
    requiresRelationship: true,
  },
  place_campaign: {
    kind: "marketing",
    topic: "marketing",
    requiresRelationship: false,
  },
  place_news: {
    kind: "marketing",
    topic: "marketing",
    requiresRelationship: false,
  },
};

export function notificationPolicy(type: NotificationEventType) {
  return policies[type];
}

export function canDeliverNotification(input: {
  type: NotificationEventType;
  notificationsEnabled: boolean;
  preferences: NotificationPreferences;
  hasRelationship?: boolean;
}) {
  if (!input.notificationsEnabled) return false;
  const policy = notificationPolicy(input.type);
  if (policy.requiresRelationship && !input.hasRelationship) return false;
  return input.preferences[policy.topic] === true;
}

export type CampaignStatus = "draft" | "queued" | "sent" | "cancelled";
export interface NotificationCampaign {
  id: string;
  title: string;
  body: string;
  status: CampaignStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export function parseCampaign(
  id: string,
  data: Record<string, unknown>,
): NotificationCampaign {
  const date = (value: unknown) => {
    if (
      value &&
      typeof value === "object" &&
      "toDate" in value &&
      typeof value.toDate === "function"
    )
      return value.toDate() as Date;
    return new Date(0);
  };
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  return {
    id,
    title: text(data.title),
    body: text(data.body),
    status: ["draft", "queued", "sent", "cancelled"].includes(
      String(data.status),
    )
      ? (data.status as CampaignStatus)
      : "draft",
    createdBy: text(data.createdBy),
    createdAt: date(data.createdAt),
    updatedAt: date(data.updatedAt),
  };
}
