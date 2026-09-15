import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Place, Event } from "../shared/models";
let pending: Promise<any> | undefined;
export function loadMaps(): Promise<any> {
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!key) {
      reject(
        Error(
          "O mapa está aguardando configuração. Explore os resultados na lista.",
        ),
      );
      return;
    }
    const script = document.createElement("script");
    const callback = "__entaoBoraMapsReady";
    const cleanup = () => {
      clearTimeout(timeout);
      delete (window as any)[callback];
      script.onerror = null;
    };
    const fail = () => {
      cleanup();
      script.remove();
      reject(Error("Não foi possível carregar o mapa. Tente novamente."));
    };
    const timeout = setTimeout(fail, 30000);
    (window as any)[callback] = () => {
      const maps = (window as any).google?.maps;
      if (typeof maps?.Map !== "function") return fail();
      cleanup();
      resolve(maps);
    };
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&language=pt-BR&loading=async&callback=${callback}`;
    script.onerror = fail;
    document.head.appendChild(script);
  }).catch((error) => {
    pending = undefined;
    throw error;
  });
  return pending;
}
export function MapView({
  places,
  events,
  position,
}: {
  places: Place[];
  events: Event[];
  position: { latitude: number; longitude: number } | null;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [attempt, setAttempt] = useState(0),
    [group, setGroup] = useState<{ name: string; url: string }[]>([]),
    navigate = useNavigate();
  useEffect(() => {
    let cancelled = false;
    const markers: any[] = [];
    let map: any;
    let readyListener: any;
    setError("");
    setLoading(true);
    loadMaps()
      .then((m) => {
        if (cancelled || !ref.current) return;
        map = new m.Map(ref.current, {
          center: {
            lat: position?.latitude ?? -22.9068,
            lng: position?.longitude ?? -43.1729,
          },
          zoom: position ? 14 : 11,
          mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || undefined,
          streetViewControl: false,
          mapTypeControl: false,
        });
        readyListener = m.event.addListenerOnce(map, "idle", () => {
          if (!cancelled) setLoading(false);
        });
        const groups = new Map<
          string,
          { lat: number; lng: number; items: { name: string; url: string }[] }
        >();
        [
          ...places.map((p) => ({
            address: p.address,
            name: p.name,
            url: `/place/${p.slug || p.id}`,
          })),
          ...events
            .filter((e) => !e.placeId)
            .map((e) => ({
              address: e.address,
              name: e.title,
              url: `/events/${e.slug || e.id}`,
            })),
        ].forEach((x) => {
          const key = `${x.address.latitude},${x.address.longitude}`;
          const g = groups.get(key) ?? {
            lat: x.address.latitude,
            lng: x.address.longitude,
            items: [],
          };
          g.items.push({ name: x.name, url: x.url });
          groups.set(key, g);
        });
        const bounds = new m.LatLngBounds();
        groups.forEach((g) => {
          const marker = new m.Marker({
            map,
            position: { lat: g.lat, lng: g.lng },
            title: g.items.map((x) => x.name).join(", "),
            label: g.items.length > 1 ? String(g.items.length) : undefined,
          });
          marker.addListener("click", () =>
            g.items.length === 1 ? navigate(g.items[0].url) : setGroup(g.items),
          );
          markers.push(marker);
          bounds.extend({ lat: g.lat, lng: g.lng });
        });
        if (groups.size > 1 && !position) map.fitBounds(bounds, 50);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
      markers.forEach((m) => m.setMap(null));
      readyListener?.remove();
    };
  }, [places, events, position, navigate, attempt]);
  return (
    <>
      <div className="map-frame" aria-busy={loading && !error}>
        <div className="map" ref={ref} aria-label="Mapa de locais e eventos" />
        {loading && !error && <MapSkeleton />}
        {error && (
          <div className="map-feedback" role="alert">
            <p>{error}</p>
            <button onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</button>
          </div>
        )}
      </div>
      {group.length > 0 && (
        <div className="message">
          <h3>Neste endereço</h3>
          {group.map((x) => (
            <p key={x.url}>
              <button onClick={() => navigate(x.url)}>{x.name} ↗</button>
            </p>
          ))}
        </div>
      )}
    </>
  );
}

export function MapSkeleton() {
  return (
    <div className="map-skeleton" role="status" aria-label="Carregando mapa">
      <div className="map-skeleton-streets" aria-hidden="true">
        <i /><i /><i /><i /><i />
        <b /><b /><b /><b />
      </div>
      <div className="map-loading-brand">
        <strong>Então Bora</strong>
        <span>Carregando</span>
        <div className="map-loading-dots" aria-hidden="true"><i /><i /><i /></div>
      </div>
    </div>
  );
}
