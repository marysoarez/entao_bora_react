import type { Event } from "../../shared/models";

function calendarDate(date: Date) {
  return date.toISOString().replace(/[-:]|\.\d{3}/g, "");
}

export function googleCalendarUrl(event: Event) {
  const eventUrl = `https://entaobora.com.br/events/${event.slug || event.id}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${calendarDate(event.startDate)}/${calendarDate(event.endDate)}`,
    details: [event.description, eventUrl].filter(Boolean).join("\n\n"),
    location: event.locationName || event.address.displayName,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
