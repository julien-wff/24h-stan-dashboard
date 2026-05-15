import { expect, test } from "bun:test";
import { CENTER, IMAGE_H, IMAGE_W, projectLatLonToImage, ROT, SCALE } from "./project";

const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((CENTER.lat * Math.PI) / 180);

function inverseProject(x: number, y: number): { lat: number; lon: number } {
  const xRot = (x - IMAGE_W / 2) * SCALE;
  const yRot = -(y - IMAGE_H / 2) * SCALE;
  const c = Math.cos(ROT);
  const s = Math.sin(ROT);
  const east = c * xRot - s * yRot;
  const north = s * xRot + c * yRot;
  return {
    lat: CENTER.lat + north / M_PER_DEG_LAT,
    lon: CENTER.lon + east / M_PER_DEG_LON,
  };
}

test("projecting the georef centre returns the image centre", () => {
  const { x, y } = projectLatLonToImage(CENTER.lat, CENTER.lon);
  expect(Math.abs(x - IMAGE_W / 2)).toBeLessThan(0.5);
  expect(Math.abs(y - IMAGE_H / 2)).toBeLessThan(0.5);
});

test("projection is a pure function (same inputs → same outputs)", () => {
  const a = projectLatLonToImage(48.696, 6.182);
  const b = projectLatLonToImage(48.696, 6.182);
  expect(a.x).toBe(b.x);
  expect(a.y).toBe(b.y);
});

test("round-trip within 1e-6° for ±0.001° offsets", () => {
  const offsets = [
    { dlat: 0.001, dlon: 0 },
    { dlat: 0, dlon: 0.001 },
    { dlat: -0.001, dlon: 0.001 },
    { dlat: 0.001, dlon: -0.001 },
  ];
  for (const { dlat, dlon } of offsets) {
    const lat = CENTER.lat + dlat;
    const lon = CENTER.lon + dlon;
    const { x, y } = projectLatLonToImage(lat, lon);
    const recovered = inverseProject(x, y);
    expect(Math.abs(recovered.lat - lat)).toBeLessThan(1e-6);
    expect(Math.abs(recovered.lon - lon)).toBeLessThan(1e-6);
  }
});
