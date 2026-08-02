"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export type LatLng = { lat: number; lng: number };
export type Trip = { purpose: string | null; km: number; path: LatLng[] };

/** A small OpenStreetMap (Leaflet) map showing the clock-in/out points, the
 *  participant's geofence, and any transport routes. Client-only. */
export function ShiftMap({
  center,
  radiusM,
  clockIn,
  clockOut,
  trips,
  heightPx = 256,
  rounded = true,
  centerLabel,
}: {
  center: LatLng | null;
  radiusM?: number;
  clockIn?: LatLng | null;
  clockOut?: LatLng | null;
  trips: Trip[];
  heightPx?: number;
  rounded?: boolean;
  centerLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current || mapRef.current) return;

      // Guard against React StrictMode double-mount leaving a stale
      // "_leaflet_id" on the element ("Map container is already initialized").
      const el = ref.current as HTMLDivElement & { _leaflet_id?: number };
      if (el._leaflet_id != null) delete el._leaflet_id;

      const map = L.map(ref.current, { scrollWheelZoom: false });
      mapRef.current = map;
      // Clean, modern, colourful basemap (Carto Voyager) — free, no key.
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        {
          subdomains: "abcd",
          maxZoom: 20,
          attribution: "© OpenStreetMap © CARTO",
        },
      ).addTo(map);

      const pts: [number, number][] = [];

      if (center) {
        L.circle([center.lat, center.lng], {
          radius: radiusM ?? 100,
          color: "#0f766e",
          weight: 1,
          fillColor: "#0f766e",
          fillOpacity: 0.08,
        }).addTo(map);
        L.circleMarker([center.lat, center.lng], {
          radius: 6,
          color: "#0f766e",
          fillColor: "#0f766e",
          fillOpacity: 1,
        })
          .addTo(map)
          .bindTooltip(
            centerLabel ?? "Client location",
            centerLabel
              ? { permanent: true, direction: "top", offset: [0, -6] }
              : undefined,
          );
        pts.push([center.lat, center.lng]);
      }
      if (clockIn) {
        L.circleMarker([clockIn.lat, clockIn.lng], {
          radius: 7,
          color: "#fff",
          weight: 2,
          fillColor: "#059669",
          fillOpacity: 1,
        })
          .addTo(map)
          .bindTooltip("Clock in");
        pts.push([clockIn.lat, clockIn.lng]);
      }
      if (clockOut) {
        L.circleMarker([clockOut.lat, clockOut.lng], {
          radius: 7,
          color: "#fff",
          weight: 2,
          fillColor: "#dc2626",
          fillOpacity: 1,
        })
          .addTo(map)
          .bindTooltip("Clock out");
        pts.push([clockOut.lat, clockOut.lng]);
      }
      for (const t of trips) {
        const line = t.path.map((p) => [p.lat, p.lng] as [number, number]);
        if (line.length >= 2) {
          L.polyline(line, { color: "#7c3aed", weight: 4, opacity: 0.85 }).addTo(map);
        }
        if (line.length) {
          L.circleMarker(line[0], {
            radius: 5,
            color: "#7c3aed",
            fillColor: "#fff",
            fillOpacity: 1,
          })
            .addTo(map)
            .bindTooltip(`Trip start${t.purpose ? ` · ${t.purpose}` : ""}`);
          L.circleMarker(line[line.length - 1], {
            radius: 5,
            color: "#7c3aed",
            fillColor: "#7c3aed",
            fillOpacity: 1,
          })
            .addTo(map)
            .bindTooltip(`Trip end · ${t.km.toFixed(1)} km`);
          line.forEach((ll) => pts.push(ll));
        }
      }

      const bounds = pts.length > 1 ? L.latLngBounds(pts) : null;
      const fit = () => {
        map.invalidateSize();
        if (bounds) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16, animate: false });
        else if (pts.length === 1) map.setView(pts[0], 15, { animate: false });
        else map.setView([-25.3, 133.8], 4);
      };
      // Defer past the modal's layout (double rAF) so fitBounds uses the final
      // container size, then re-fit a few times as tiles settle.
      requestAnimationFrame(() => requestAnimationFrame(fit));
      [250, 600, 1000].forEach((ms) => setTimeout(fit, ms));
    })();

    return () => {
      cancelled = true;
      const m = mapRef.current as { remove?: () => void } | null;
      if (m && typeof m.remove === "function") m.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Height pinned inline so the map can never collapse if the utility class
  // is missing; bg gives a visible placeholder while tiles load.
  // `isolation: isolate` creates a stacking context so Leaflet's high z-index
  // panes can't paint on top of drawers/modals.
  return (
    <div
      ref={ref}
      className={`w-full bg-slate-100 ${rounded ? "rounded-xl" : ""}`}
      style={{
        height: heightPx,
        minHeight: heightPx,
        isolation: "isolate",
        position: "relative",
        zIndex: 0,
      }}
    />
  );
}
