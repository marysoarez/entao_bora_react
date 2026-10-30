import {
  initializeAnalytics,
  isSupported,
  logEvent,
  type Analytics,
} from "firebase/analytics";
import { configured, firebaseApp } from "./firebase";

type AnalyticsPage = { path: string; title: string };

let analyticsPromise: Promise<Analytics | null> | undefined;
let previousPageLocation: string | undefined;

function analyticsPage(pathname: string): AnalyticsPage {
  if (pathname === "/") return { path: "/", title: "explore" };
  if (pathname === "/events/create")
    return { path: "/events/create", title: "event_create" };
  if (/^\/events\/[^/]+\/edit$/.test(pathname))
    return { path: "/events/:id/edit", title: "event_edit" };
  if (/^\/events\/[^/]+$/.test(pathname))
    return { path: "/events/:id", title: "event_details" };
  if (pathname === "/places/create")
    return { path: "/places/create", title: "place_create" };
  if (/^\/places\/[^/]+\/edit$/.test(pathname))
    return { path: "/places/:id/edit", title: "place_edit" };
  if (pathname === "/places/manage")
    return { path: "/places/manage", title: "places_manage" };
  if (pathname === "/places/menu")
    return { path: "/places/menu", title: "menu_management" };
  const managementPages: Record<string, string> = {
    "/places/orders": "orders",
    "/places/inventory": "inventory",
    "/places/purchases": "purchases",
    "/places/notifications": "notifications",
    "/places/service-sessions": "service_sessions",
    "/places/tables": "tables",
  };
  if (managementPages[pathname])
    return { path: pathname, title: managementPages[pathname] };
  if (pathname === "/partner-dashboard")
    return { path: pathname, title: "partner_dashboard" };
  if (pathname === "/minha-area") return { path: pathname, title: "user_area" };
  if (pathname === "/admin") return { path: pathname, title: "admin" };
  if (pathname === "/politica-de-privacidade")
    return { path: pathname, title: "privacy_policy" };
  if (/^\/checkin\/[^/]+$/.test(pathname))
    return { path: "/checkin/:slug", title: "checkin" };
  if (/^\/(place|places)\/[^/]+$/.test(pathname))
    return { path: "/place/:id", title: "place_details" };
  return { path: "/404", title: "not_found" };
}

function getWebAnalytics(): Promise<Analytics | null> {
  if (!analyticsPromise) {
    analyticsPromise = (async () => {
      if (!configured || !firebaseApp || !(await isSupported())) return null;
      return initializeAnalytics(firebaseApp, {
        config: { send_page_view: false },
      });
    })().catch(() => null);
  }
  return analyticsPromise;
}

export async function logPageView(pathname: string): Promise<void> {
  try {
    const analytics = await getWebAnalytics();
    if (!analytics) return;

    const page = analyticsPage(pathname);
    const pageLocation = `${window.location.origin}${page.path}`;
    logEvent(analytics, "page_view", {
      page_title: page.title,
      page_path: page.path,
      page_location: pageLocation,
      ...(previousPageLocation ? { page_referrer: previousPageLocation } : {}),
    });
    previousPageLocation = pageLocation;
  } catch {
    // Analytics must never block navigation or product functionality.
  }
}
