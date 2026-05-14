type BBox = { west: number; south: number; east: number; north: number };

interface STLOptions {
  bbox: BBox;
  printWidthMm: number;
  baseMm: number;
  zExaggeration: number;
}

interface Heightmap {
  grid: number;
  values: Float32Array; // meters; row-major, row 0 = north
}

export function heightmapToSTL(hm: Heightmap, opts: STLOptions): Buffer {
  const { grid, values } = hm;
  const { bbox, printWidthMm, baseMm, zExaggeration } = opts;

  const widthMeters = haversine(bbox.south, bbox.west, bbox.south, bbox.east);
  const heightMeters = haversine(bbox.south, bbox.west, bbox.north, bbox.west);
  const longerMeters = Math.max(widthMeters, heightMeters);
  const mmPerMeter = printWidthMm / longerMeters;

  const xSpanMm = widthMeters * mmPerMeter;
  const ySpanMm = heightMeters * mmPerMeter;

  let minH = Infinity;
  for (let i = 0; i < values.length; i++) if (values[i] < minH) minH = values[i];
  if (!isFinite(minH)) minH = 0;

  const zScale = mmPerMeter * zExaggeration;
  const heights = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) {
    heights[i] = (values[i] - minH) * zScale + baseMm;
  }

  const nTri = 2 * (grid - 1) * (grid - 1) + 2 + 8 * (grid - 1);
  const buf = Buffer.alloc(84 + nTri * 50);
  buf.writeUInt32LE(nTri, 80);
  let off = 84;

  const xy = (i: number, j: number): [number, number] => {
    const x = (i / (grid - 1)) * xSpanMm - xSpanMm / 2;
    // j=0 is north (max Y); j=grid-1 is south (min Y)
    const y = ySpanMm / 2 - (j / (grid - 1)) * ySpanMm;
    return [x, y];
  };
  const h = (i: number, j: number) => heights[j * grid + i];

  // Top surface
  for (let j = 0; j < grid - 1; j++) {
    for (let i = 0; i < grid - 1; i++) {
      const [x0, y0] = xy(i, j);
      const [x1, y1] = xy(i + 1, j);
      const [x2, y2] = xy(i + 1, j + 1);
      const [x3, y3] = xy(i, j + 1);
      const z0 = h(i, j);
      const z1 = h(i + 1, j);
      const z2 = h(i + 1, j + 1);
      const z3 = h(i, j + 1);
      off = writeTri(buf, off, [x0, y0, z0], [x3, y3, z3], [x2, y2, z2]);
      off = writeTri(buf, off, [x0, y0, z0], [x2, y2, z2], [x1, y1, z1]);
    }
  }

  // Bottom (two triangles, z=0, normal -Z)
  const [bx0, by0] = xy(0, grid - 1);          // SW
  const [bx1, by1] = xy(grid - 1, grid - 1);   // SE
  const [bx2, by2] = xy(grid - 1, 0);          // NE
  const [bx3, by3] = xy(0, 0);                 // NW
  off = writeTri(buf, off, [bx0, by0, 0], [bx1, by1, 0], [bx2, by2, 0]);
  off = writeTri(buf, off, [bx0, by0, 0], [bx2, by2, 0], [bx3, by3, 0]);

  // North wall (j=0, normal +Y)
  for (let i = 0; i < grid - 1; i++) {
    const [xa, ya] = xy(i, 0);
    const [xb, yb] = xy(i + 1, 0);
    const za = h(i, 0);
    const zb = h(i + 1, 0);
    off = writeTri(buf, off, [xa, ya, 0], [xb, yb, zb], [xa, ya, za]);
    off = writeTri(buf, off, [xa, ya, 0], [xb, yb, 0], [xb, yb, zb]);
  }
  // South wall (j=grid-1, normal -Y)
  for (let i = 0; i < grid - 1; i++) {
    const [xa, ya] = xy(i, grid - 1);
    const [xb, yb] = xy(i + 1, grid - 1);
    const za = h(i, grid - 1);
    const zb = h(i + 1, grid - 1);
    off = writeTri(buf, off, [xa, ya, 0], [xa, ya, za], [xb, yb, zb]);
    off = writeTri(buf, off, [xa, ya, 0], [xb, yb, zb], [xb, yb, 0]);
  }
  // West wall (i=0, normal -X)
  for (let j = 0; j < grid - 1; j++) {
    const [xa, ya] = xy(0, j);
    const [xb, yb] = xy(0, j + 1);
    const za = h(0, j);
    const zb = h(0, j + 1);
    off = writeTri(buf, off, [xa, ya, 0], [xa, ya, za], [xb, yb, zb]);
    off = writeTri(buf, off, [xa, ya, 0], [xb, yb, zb], [xb, yb, 0]);
  }
  // East wall (i=grid-1, normal +X)
  for (let j = 0; j < grid - 1; j++) {
    const [xa, ya] = xy(grid - 1, j);
    const [xb, yb] = xy(grid - 1, j + 1);
    const za = h(grid - 1, j);
    const zb = h(grid - 1, j + 1);
    off = writeTri(buf, off, [xa, ya, 0], [xb, yb, zb], [xa, ya, za]);
    off = writeTri(buf, off, [xa, ya, 0], [xb, yb, 0], [xb, yb, zb]);
  }

  return buf;
}

type V3 = [number, number, number];

function writeTri(buf: Buffer, off: number, a: V3, b: V3, c: V3): number {
  const n = normal(a, b, c);
  buf.writeFloatLE(n[0], off); off += 4;
  buf.writeFloatLE(n[1], off); off += 4;
  buf.writeFloatLE(n[2], off); off += 4;
  for (const v of [a, b, c]) {
    buf.writeFloatLE(v[0], off); off += 4;
    buf.writeFloatLE(v[1], off); off += 4;
    buf.writeFloatLE(v[2], off); off += 4;
  }
  buf.writeUInt16LE(0, off); off += 2;
  return off;
}

function normal(a: V3, b: V3, c: V3): V3 {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
