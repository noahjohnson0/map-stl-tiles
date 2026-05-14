import { NextRequest } from "next/server";
import { PNG } from "pngjs";
import { buildHeightmap } from "@/lib/heightmap";
import { heightmapToSTL } from "@/lib/stl";

export const runtime = "nodejs";
export const maxDuration = 60;

type BBox = { west: number; south: number; east: number; north: number };

export async function POST(req: NextRequest) {
  let body: {
    bbox: BBox;
    heightMm: number;
    baseMm: number;
    zExaggeration: number;
  };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { bbox, heightMm, baseMm, zExaggeration } = body;
  if (!bbox || bbox.east <= bbox.west || bbox.north <= bbox.south) {
    return new Response("Invalid bbox", { status: 400 });
  }

  const gridSize = 200;
  try {
    const heightmap = await buildHeightmap(bbox, gridSize, fetchTerrarium);
    const stl = heightmapToSTL(heightmap, {
      bbox,
      printWidthMm: heightMm,
      baseMm,
      zExaggeration,
    });
    return new Response(new Uint8Array(stl), {
      headers: {
        "content-type": "model/stl",
        "content-disposition": `attachment; filename="tile.stl"`,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(`Failed to build STL: ${msg}`, { status: 500 });
  }
}

async function fetchTerrarium(z: number, x: number, y: number): Promise<{
  width: number;
  height: number;
  data: Buffer;
}> {
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Tile ${z}/${x}/${y} failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const png = PNG.sync.read(buf);
  return { width: png.width, height: png.height, data: png.data };
}
