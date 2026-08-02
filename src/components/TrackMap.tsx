"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export type LatLng = { lat: number; lng: number };

/** Shows the client (shift) location + geofence and, if known, the worker's
 *  latest position with a line between them. Client-only (Leaflet). */
export function TrackMap({
  client,
  worker,
  radiusM,
}: {
  client: LatLng;
  worker: LatLng | null;
  radiusM?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current || mapRef.current) return;

      const el = ref.current as HTMLDivElement & { _leaflet_id?: number };
      if (el._leaflet_id != null) delete el._leaflet_id;

      const map = L.map(ref.current, { scrollWheelZoom: false, attributionControl: false });
      mapRef.current = map;
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        { subdomains: "abcd", maxZoom: 20 },
      ).addTo(map);

      const pts: [number, number][] = [];

      // Client (destination) + geofence.
      L.circle([client.lat, client.lng], {
        radius: radiusM ?? 100,
        color: "#003146",
        weight: 1,
        fillColor: "#003146",
        fillOpacity: 0.08,
      }).addTo(map);
      L.circleMarker([client.lat, client.lng], {
        radius: 7,
        color: "#fff",
        weight: 2,
        fillColor: "#003146",
        fillOpacity: 1,
      })
        .addTo(map)
        .bindTooltip("Client");
      pts.push([client.lat, client.lng]);

      // Worker (if we have a recent position).
      if (worker) {
        L.circleMarker([worker.lat, worker.lng], {
          radius: 7,
          color: "#fff",
          weight: 2,
          fillColor: "#886949",
          fillOpacity: 1,
        })
          .addTo(map)
          .bindTooltip("Worker");
        pts.push([worker.lat, worker.lng]);
        L.polyline(
          [
            [worker.lat, worker.lng],
            [client.lat, client.lng],
          ],
          { color: "#886949", weight: 3, dashArray: "6 6", opacity: 0.9 },
        ).addTo(map);
      }

      const fit = () => {
        map.invalidateSize();
        if (pts.length > 1)
          map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 15, animate: false });
        else map.setView(pts[0], 15, { animate: false });
      };
      requestAnimationFrame(() => requestAnimationFrame(fit));
      [250, 600].forEach((ms) => setTimeout(fit, ms));
    })();

    return () => {
      cancelled = true;
      const m = mapRef.current as { remove?: () => void } | null;
      if (m && typeof m.remove === "function") m.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      className="w-full rounded-xl bg-slate-100"
      style={{ height: 240, minHeight: 240, isolation: "isolate", position: "relative", zIndex: 0 }}
    />
  );
}
