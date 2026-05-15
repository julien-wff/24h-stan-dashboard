export const SECTOR_NAMES = [
  "S1 · LIGNE DROITE EST",
  "S2 · VIRAGE NORD",
  "S3 · LIGNE DROITE OUEST",
  "S4 · VIRAGE SUD",
] as const;

// Fractional lap positions (0..1) at which each sector boundary occurs.
// Sector 0 starts at 0, sector 1 at index 0, sector 2 at index 1, sector 3 at index 2.
export const sectorBoundaryS = [0.25, 0.5, 0.75] as const;
