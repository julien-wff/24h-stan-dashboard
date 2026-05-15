export const CENTER = { lat: 48.69579697764976, lon: 6.181701396382847 };
// Empirically calibrated against the GPX overlay (see design.md §"Risks"):
// ROT is the principal axis of track.gpx in local east/north metres (PCA);
// SCALE matches the visible track width in the rendered image.
export const ROT = -1.1338896989669105;
export const ROT_DEG = (ROT * 180) / Math.PI;
export const SCALE = 0.21;
export const IMAGE_W = 1615;
export const IMAGE_H = 974;

const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((CENTER.lat * Math.PI) / 180);

export function projectLatLonToImage(lat: number, lon: number): { x: number; y: number } {
  const east = (lon - CENTER.lon) * M_PER_DEG_LON;
  const north = (lat - CENTER.lat) * M_PER_DEG_LAT;
  const c = Math.cos(ROT);
  const s = Math.sin(ROT);
  const xRot = c * east + s * north;
  const yRot = -s * east + c * north;
  return {
    x: IMAGE_W / 2 + xRot / SCALE,
    y: IMAGE_H / 2 - yRot / SCALE,
  };
}
