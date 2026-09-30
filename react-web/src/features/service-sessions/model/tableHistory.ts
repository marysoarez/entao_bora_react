import type { ServiceSession } from "./serviceSession";
export function tableHistory(sessions: ServiceSession[], tableId: string) {
  return sessions
    .filter(
      (session) =>
        session.serviceType === "table" && session.tableId === tableId,
    )
    .sort(
      (a, b) =>
        b.openedAt.getTime() - a.openedAt.getTime() || a.id.localeCompare(b.id),
    );
}
export function sessionDuration(session: ServiceSession, now: number): string {
  const minutes = Math.max(
    0,
    Math.floor(
      ((session.closedAt?.getTime() ?? now) - session.openedAt.getTime()) /
        60000,
    ),
  );
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`
    : `${minutes} min`;
}
