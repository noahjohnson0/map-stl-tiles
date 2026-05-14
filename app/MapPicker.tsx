"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type BBox = { west: number; south: number; east: number; north: number };

function bboxFromCenter(lng: number, lat: number, sizeKm: number): BBox {
  const halfKm = sizeKm / 2;
  const dLat = halfKm / 111.32;
  const dLng = halfKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  return { west: lng - dLng, east: lng + dLng, south: lat - dLat, north: lat + dLat };
}

export default function MapPicker() {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [center, setCenter] = useState<[number, number]>([-122.4194, 37.7749]);
  const [zoom, setZoom] = useState(11);
  const [sizeKm, setSizeKm] = useState(5);
  const [heightMm, setHeightMm] = useState(80);
  const [baseMm, setBaseMm] = useState(3);
  const [zExaggeration, setZExaggeration] = useState(1.5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapEl.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center,
      zoom,
    });
    mapRef.current = map;

    map.on("load", () => {
      const bbox = bboxFromCenter(center[0], center[1], sizeKm);
      map.addSource("selection", { type: "geojson", data: bboxToGeoJSON(bbox) });
      map.addLayer({
        id: "selection-fill",
        type: "fill",
        source: "selection",
        paint: { "fill-color": "#ff6a00", "fill-opacity": 0.18 },
      });
      map.addLayer({
        id: "selection-line",
        type: "line",
        source: "selection",
        paint: { "line-color": "#ff6a00", "line-width": 2 },
      });
    });

    map.on("move", () => {
      const c = map.getCenter();
      setCenter([c.lng, c.lat]);
      setZoom(map.getZoom());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("selection")) return;
    const bbox = bboxFromCenter(center[0], center[1], sizeKm);
    (map.getSource("selection") as maplibregl.GeoJSONSource).setData(bboxToGeoJSON(bbox));
  }, [center, sizeKm]);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const bbox = bboxFromCenter(center[0], center[1], sizeKm);
      const res = await fetch("/api/stl", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bbox, heightMm, baseMm, zExaggeration }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tile_${center[1].toFixed(4)}_${center[0].toFixed(4)}_${sizeKm}km.stl`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div ref={mapEl} style={{ flex: 1 }} />
      <aside style={{ width: 320, padding: 20, background: "#0f1419", color: "#e6edf3", overflow: "auto" }}>
        <h2 style={{ marginTop: 0 }}>Map STL Tiles</h2>
        <p style={{ fontSize: 13, opacity: 0.75 }}>
          Pan/zoom the map. The orange box is your tile. Adjust size and printable dimensions, then download.
        </p>

        <Field label={`Tile size: ${sizeKm.toFixed(1)} km`}>
          <input type="range" min={1} max={40} step={0.5} value={sizeKm} onChange={(e) => setSizeKm(+e.target.value)} />
        </Field>

        <Field label={`Print width: ${heightMm} mm`}>
          <input type="range" min={40} max={250} step={1} value={heightMm} onChange={(e) => setHeightMm(+e.target.value)} />
        </Field>

        <Field label={`Base thickness: ${baseMm} mm`}>
          <input type="range" min={0} max={15} step={0.5} value={baseMm} onChange={(e) => setBaseMm(+e.target.value)} />
        </Field>

        <Field label={`Vertical exaggeration: ${zExaggeration.toFixed(2)}×`}>
          <input type="range" min={0.5} max={5} step={0.1} value={zExaggeration} onChange={(e) => setZExaggeration(+e.target.value)} />
        </Field>

        <button
          onClick={download}
          disabled={busy}
          style={{
            marginTop: 16,
            width: "100%",
            padding: "10px 14px",
            background: busy ? "#444" : "#ff6a00",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: busy ? "wait" : "pointer",
            fontWeight: 600,
          }}
        >
          {busy ? "Generating…" : "Download STL"}
        </button>

        {error && <p style={{ color: "#ff8080", fontSize: 13 }}>{error}</p>}

        <div style={{ marginTop: 20, fontSize: 11, opacity: 0.6 }}>
          Elevation: AWS Terrarium tiles. Map: OpenStreetMap.
        </div>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginTop: 14, fontSize: 13 }}>
      <div style={{ marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

function bboxToGeoJSON(b: BBox): GeoJSON.Feature {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [[
        [b.west, b.south],
        [b.east, b.south],
        [b.east, b.north],
        [b.west, b.north],
        [b.west, b.south],
      ]],
    },
  };
}
