import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Place, Event } from "../shared/models";
import { boraHeatBands, boraHeatPoints, createBoraHeatmap } from "./boraHeatmap";
let pending: Promise<any> | undefined;

function halloweenMarkerIcon(maps: any) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="48" viewBox="0 0 42 48"><path fill="#101010" stroke="#ff8a3d" stroke-width="2" d="M21 47C17 40 5 31 5 19a16 16 0 1 1 32 0c0 12-12 21-16 28Z"/><path fill="#ff8a3d" d="M19 9c0-3 2-5 5-5-1 2-1 4 1 6l-6-1Z"/><path fill="#e86f24" d="M21 11c8 0 12 4 12 10s-4 11-12 11S9 27 9 21s4-10 12-10Z"/><path fill="#19130f" d="m15 18 4 3h-6l2-3Zm12 0 2 3h-6l4-3Zm-11 8h10l-2 3h-6l-2-3Z"/></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new maps.Size(42, 48),
    labelOrigin: new maps.Point(21, 38),
  };
}
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
    let heatmap: ReturnType<typeof createBoraHeatmap> | undefined;
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
        heatmap = createBoraHeatmap(m, map, events);
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
            icon: halloweenMarkerIcon(m),
            label: g.items.length > 1 ? {
              text: String(g.items.length),
              color: "#fff",
              fontSize: "11px",
              fontWeight: "700",
            } : undefined,
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
      heatmap?.setMap(null);
      readyListener?.remove();
    };
  }, [places, events, position, navigate, attempt]);
  return (
    <>
      <div className="map-frame" aria-busy={loading && !error}>
        <div className="map" ref={ref} aria-label="Mapa de locais e eventos" />
        {!loading && !error && (
          <div className="map-season-badge" aria-hidden="true">
            <span>🎃</span> Mapa assombrado
          </div>
        )}
        {!loading && !error && (
          <div className="map-heat-legend">
            <strong>Calor de Boras</strong>
            {boraHeatPoints(events).length ? (
              <div className="map-heat-bands">{boraHeatBands.map((band) => (<span key={band.min}><i style={{ background: `rgb(${band.color.join(",")})` }} />{band.label}</span>))}</div>
            ) : <span>Sem Boras nos eventos filtrados</span>}
          </div>
        )}
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
