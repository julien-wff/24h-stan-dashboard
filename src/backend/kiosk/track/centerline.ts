import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { haversineMeters } from "../telemetry/gpx";

export const SECTOR_BOUNDARIES_S = [0, 0.25, 0.5, 0.75] as const;

export interface CenterlinePoint {
  lat: number;
  lon: number;
  cumulativeMeters: number;
}

export interface Centerline {
  points: CenterlinePoint[];
  totalMeters: number;
  project(lat: number, lon: number): { sM: number; s: number; sector: 0 | 1 | 2 | 3 };
}

export function loadCenterline(path: string): Centerline {
  const absPath = resolve(path);

  let text: string;
  try {
    text = readFileSync(absPath, "utf-8");
  } catch {
    throw new Error(`GPX file missing or unreadable: ${absPath}`);
  }

  const rawPoints = [...text.matchAll(/<trkpt\s+lat="([\d.-]+)"\s+lon="([\d.-]+)"/g)].map((m) => ({
    lat: Number(m[1]),
    lon: Number(m[2]),
  }));

  if (rawPoints.length < 2) {
    throw new Error(`GPX file has fewer than 2 distinct <trkpt> points: ${absPath}`);
  }

  let cumulative = 0;
  const [first, ...rest] = rawPoints as [
    { lat: number; lon: number },
    ...{ lat: number; lon: number }[],
  ];
  const points: CenterlinePoint[] = [{ ...first, cumulativeMeters: 0 }];
  let prev = first;
  for (const pt of rest) {
    cumulative += haversineMeters(prev, pt);
    points.push({ ...pt, cumulativeMeters: cumulative });
    prev = pt;
  }

  const totalMeters = cumulative;

  function project(lat: number, lon: number): { sM: number; s: number; sector: 0 | 1 | 2 | 3 } {
    let bestDist = Infinity;
    let bestSM = 0;

    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!;
      const b = points[i + 1]!;

      const dLat = b.lat - a.lat;
      const dLon = b.lon - a.lon;
      const lenSq = dLat * dLat + dLon * dLon;

      let t = 0;
      if (lenSq > 0) {
        t = Math.max(0, Math.min(1, ((lat - a.lat) * dLat + (lon - a.lon) * dLon) / lenSq));
      }

      const projLat = a.lat + t * dLat;
      const projLon = a.lon + t * dLon;
      const dist = haversineMeters({ lat, lon }, { lat: projLat, lon: projLon });

      if (dist < bestDist) {
        bestDist = dist;
        const segLen = b.cumulativeMeters - a.cumulativeMeters;
        bestSM = a.cumulativeMeters + t * segLen;
      }
    }

    const s = totalMeters > 0 ? bestSM / totalMeters : 0;

    let sector: 0 | 1 | 2 | 3 = 0;
    if (s >= SECTOR_BOUNDARIES_S[3]) sector = 3;
    else if (s >= SECTOR_BOUNDARIES_S[2]) sector = 2;
    else if (s >= SECTOR_BOUNDARIES_S[1]) sector = 1;

    return { sM: bestSM, s, sector };
  }

  return { points, totalMeters, project };
}
