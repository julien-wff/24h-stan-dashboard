import mapImg from "@frontend/kiosk/assets/track-satellite-dark.webp";
import { useRaceState } from "@frontend/kiosk/state/store";
import { useEffect, useRef, useState } from "react";
import { Panel } from "../host";
import { IMAGE_H, IMAGE_W, projectLatLonToImage, ROT_DEG } from "./project";

const TRAIL_MAX = 30;

// Module-scope cache: fetch once per page load, reuse on re-mounts
let _trackPoints: { lat: number; lon: number }[] | null = null;
let _trackPromise: Promise<{ lat: number; lon: number }[]> | null = null;

function loadTrack(): Promise<{ lat: number; lon: number }[]> {
  if (_trackPoints !== null) return Promise.resolve(_trackPoints);
  if (_trackPromise !== null) return _trackPromise;
  _trackPromise = fetch("/api/track")
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<{ points: { lat: number; lon: number }[] }>;
    })
    .then((data) => {
      _trackPoints = data.points ?? [];
      return _trackPoints;
    })
    .catch((err: unknown) => {
      console.warn("[map] debug track fetch failed:", String(err));
      _trackPoints = [];
      return [];
    });
  return _trackPromise;
}

export function MapComponent() {
  const { lat, lon, heading, t } = useRaceState();

  // Trail: accumulate last TRAIL_MAX projected positions across renders
  const trailRef = useRef<{ x: number; y: number }[]>([]);
  const prevTRef = useRef<number | null>(null);

  if (t !== prevTRef.current) {
    prevTRef.current = t;
    if (lat !== null && lon !== null && Number.isFinite(lat) && Number.isFinite(lon)) {
      const pt = projectLatLonToImage(lat, lon);
      const next = [...trailRef.current, pt];
      trailRef.current = next.length > TRAIL_MAX ? next.slice(next.length - TRAIL_MAX) : next;
    } else {
      trailRef.current = [];
    }
  }

  // Debug overlay: read URL param once at mount
  const isDebug = useRef(
    new URLSearchParams(window.location.search).get("debug") === "track",
  ).current;

  const [debugPoints, setDebugPoints] = useState<{ x: number; y: number }[]>([]);

  useEffect(() => {
    if (!isDebug) return;
    loadTrack().then((pts) => {
      setDebugPoints(pts.map((p) => projectLatLonToImage(p.lat, p.lon)));
    });
  }, [isDebug]);

  // Marker
  const hasGps = lat !== null && lon !== null && Number.isFinite(lat) && Number.isFinite(lon);
  const markerPos = hasGps ? projectLatLonToImage(lat as number, lon as number) : null;
  const hasHeading = heading !== null && Number.isFinite(heading);

  const trail = trailRef.current;
  const trailPoints = trail.map((p) => `${p.x},${p.y}`).join(" ");
  const debugPolylinePoints = debugPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <Panel title="PLACE DE LA CARRIÈRE · NANCY">
      <div className="relative min-h-0 w-full flex-1">
        <img
          src={mapImg as string}
          alt=""
          className="absolute inset-0 h-full w-full object-contain"
        />
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${IMAGE_W} ${IMAGE_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 h-full w-full"
        >
          {isDebug && debugPolylinePoints.length > 0 && (
            <polyline
              points={debugPolylinePoints}
              className="fill-none stroke-text/55 stroke-[2px]"
            />
          )}
          {trail.length > 0 && (
            <polyline points={trailPoints} className="fill-none stroke-yellow/40 stroke-[3px]" />
          )}
          {markerPos !== null && (
            <>
              <circle
                cx={markerPos.x}
                cy={markerPos.y}
                r={54}
                className="fill-yellow/30 origin-center transform-fill animate-[pulse-halo_1.2s_ease-in-out_infinite]"
              />
              <circle
                cx={markerPos.x}
                cy={markerPos.y}
                r={28}
                className="fill-none stroke-white stroke-[4px]"
              />
              <circle
                cx={markerPos.x}
                cy={markerPos.y}
                r={22}
                className="fill-yellow stroke-black stroke-[3px]"
              />
              {hasHeading && (
                <polygon
                  points={`${markerPos.x},${markerPos.y - 56} ${markerPos.x - 18},${markerPos.y - 24} ${markerPos.x + 18},${markerPos.y - 24}`}
                  className="fill-yellow stroke-black stroke-[3px]"
                  transform={`rotate(${heading + ROT_DEG}, ${markerPos.x}, ${markerPos.y})`}
                />
              )}
            </>
          )}
        </svg>
      </div>
    </Panel>
  );
}
