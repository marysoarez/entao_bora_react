export const checkInSources = ["manual", "qr", "geofence", "staff"] as const;
export type CheckInSource = (typeof checkInSources)[number];

export interface CheckIn {
  userId: string;
  placeId: string;
  source: CheckInSource;
  sources: CheckInSource[];
  checkedInAt: Date;
  checkedOutAt: Date | null;
}

// Absence means unconfigured, not consent or activation.
export interface AutoCheckinSettings {
  autoCheckinEnabled?: boolean;
  radiusMeters?: number;
  minimumStayMinutes?: number;
}

export function validAutoCheckinSettings(value: unknown): value is AutoCheckinSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const d = value as Record<string, unknown>;
  return Object.keys(d).every(k => ["autoCheckinEnabled", "radiusMeters", "minimumStayMinutes"].includes(k)) &&
    (d.autoCheckinEnabled === undefined || typeof d.autoCheckinEnabled === "boolean") &&
    [d.radiusMeters, d.minimumStayMinutes].every(n => n === undefined || (typeof n === "number" && Number.isFinite(n) && n > 0));
}

export function mergeCheckInSources(current: readonly CheckInSource[], source: CheckInSource): CheckInSource[] {
  if (!checkInSources.includes(source) || current.some(s => !checkInSources.includes(s)))
    throw Error("Origem de check-in inválida.");
  return [...new Set([...current, source])];
}
