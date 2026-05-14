type BBox = { west: number; south: number; east: number; north: number };

type TileFetcher = (z: number, x: number, y: number) => Promise<{
  width: number;
  height: number;
  data: Buffer;
}>;

function lonToTileX(lon: number, z: number): number {
  return ((lon + 180) / 360) * Math.pow(2, z);
}

function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z);
}

function pickZoom(bbox: BBox, targetSamples: number, tileSize = 256): number {
  // pick smallest zoom such that bbox covers >= targetSamples pixels along its longer axis
  for (let z = 0; z <= 14; z++) {
    const x0 = lonToTileX(bbox.west, z) * tileSize;
    const x1 = lonToTileX(bbox.east, z) * tileSize;
    const y0 = latToTileY(bbox.north, z) * tileSize;
    const y1 = latToTileY(bbox.south, z) * tileSize;
    const w = x1 - x0;
    const h = y1 - y0;
    if (Math.max(w, h) >= targetSamples) return z;
  }
  return 14;
}

function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

export async function buildHeightmap(
  bbox: BBox,
  grid: number,
  fetcher: TileFetcher,
  tileSize = 256
): Promise<{ grid: number; values: Float32Array }> {
  const z = pickZoom(bbox, grid, tileSize);
  const px0 = lonToTileX(bbox.west, z) * tileSize;
  const px1 = lonToTileX(bbox.east, z) * tileSize;
  const py0 = latToTileY(bbox.north, z) * tileSize;
  const py1 = latToTileY(bbox.south, z) * tileSize;

  const minTileX = Math.floor(Math.min(px0, px1) / tileSize);
  const maxTileX = Math.floor(Math.max(px0, px1) / tileSize);
  const minTileY = Math.floor(Math.min(py0, py1) / tileSize);
  const maxTileY = Math.floor(Math.max(py0, py1) / tileSize);

  const tiles = new Map<string, { width: number; height: number; data: Buffer }>();
  const jobs: Promise<void>[] = [];
  for (let tx = minTileX; tx <= maxTileX; tx++) {
    for (let ty = minTileY; ty <= maxTileY; ty++) {
      const key = `${tx},${ty}`;
      jobs.push(
        fetcher(z, tx, ty).then((tile) => {
          tiles.set(key, tile);
        })
      );
    }
  }
  await Promise.all(jobs);

  const values = new Float32Array(grid * grid);
  for (let j = 0; j < grid; j++) {
    // j=0 -> north (top of model); sample lat from north to south
    const v = j / (grid - 1);
    const py = py0 + (py1 - py0) * v;
    const tileY = Math.floor(py / tileSize);
    const inY = Math.floor(py - tileY * tileSize);
    for (let i = 0; i < grid; i++) {
      const u = i / (grid - 1);
      const px = px0 + (px1 - px0) * u;
      const tileX = Math.floor(px / tileSize);
      const inX = Math.floor(px - tileX * tileSize);
      const tile = tiles.get(`${tileX},${tileY}`);
      if (!tile) {
        values[j * grid + i] = 0;
        continue;
      }
      const cx = clamp(inX, 0, tile.width - 1);
      const cy = clamp(inY, 0, tile.height - 1);
      const idx = (cy * tile.width + cx) * 4;
      const r = tile.data[idx];
      const g = tile.data[idx + 1];
      const b = tile.data[idx + 2];
      values[j * grid + i] = decodeTerrarium(r, g, b);
    }
  }
  return { grid, values };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
