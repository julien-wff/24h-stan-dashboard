const EARTH_RADIUS_M = 6_371_000;

export interface LatLon {
  lat: number;
  lon: number;
}

export interface TrackPoint extends LatLon {
  cumulativeMeters: number;
}

export interface TrackPolyline {
  points: TrackPoint[];
  totalMeters: number;
}

export function haversineMeters(a: LatLon, b: LatLon): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinDLon * sinDLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function bearingDegrees(a: LatLon, b: LatLon): number {
  const aLat = (a.lat * Math.PI) / 180;
  const bLat = (b.lat * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(bLat);
  const x = Math.cos(aLat) * Math.sin(bLat) - Math.sin(aLat) * Math.cos(bLat) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export async function parseGpx(path: string): Promise<TrackPolyline> {
  let text: string;
  try {
    text = await Bun.file(path).text();
  } catch {
    throw new Error(`GPX file missing or unreadable: ${path}`);
  }

  const rawPoints: LatLon[] = [...text.matchAll(/<trkpt\s+lat="([\d.-]+)"\s+lon="([\d.-]+)"/g)].map(
    (m) => ({ lat: Number(m[1]), lon: Number(m[2]) }),
  );

  if (rawPoints.length < 2) {
    throw new Error(`GPX file has fewer than 2 distinct <trkpt> points: ${path}`);
  }

  let cumulative = 0;
  const [first, ...rest] = rawPoints as [LatLon, ...LatLon[]];
  const points: TrackPoint[] = [{ ...first, cumulativeMeters: 0 }];
  let prev: LatLon = first;
  for (const point of rest) {
    cumulative += haversineMeters(prev, point);
    points.push({ ...point, cumulativeMeters: cumulative });
    prev = point;
  }

  return { points, totalMeters: cumulative };
}

export function pointAtDistance(
  polyline: TrackPolyline,
  distanceM: number,
): { lat: number; lon: number; segmentIndex: number } {
  const wrapped =
    ((distanceM % polyline.totalMeters) + polyline.totalMeters) % polyline.totalMeters;
  const points = polyline.points;

  let lo = 0;
  let hi = points.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const midPoint = points[mid];
    if (midPoint && midPoint.cumulativeMeters <= wrapped) lo = mid;
    else hi = mid - 1;
  }

  const a = points[lo];
  const b = points[lo + 1];
  if (!a || !b) {
    throw new Error(`pointAtDistance: invalid polyline index ${lo}`);
  }
  const segLen = b.cumulativeMeters - a.cumulativeMeters;
  const t = segLen > 0 ? (wrapped - a.cumulativeMeters) / segLen : 0;

  return {
    lat: a.lat + t * (b.lat - a.lat),
    lon: a.lon + t * (b.lon - a.lon),
    segmentIndex: lo,
  };
}
