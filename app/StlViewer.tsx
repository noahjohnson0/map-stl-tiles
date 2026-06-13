"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/** Parse a binary STL ArrayBuffer into a non-indexed BufferGeometry. */
function parseBinarySTL(buffer: ArrayBuffer): THREE.BufferGeometry {
  const view = new DataView(buffer);
  const nTri = view.getUint32(80, true);
  const positions = new Float32Array(nTri * 9);
  const normals = new Float32Array(nTri * 9);

  let offset = 84;
  for (let t = 0; t < nTri; t++) {
    const nx = view.getFloat32(offset, true);
    const ny = view.getFloat32(offset + 4, true);
    const nz = view.getFloat32(offset + 8, true);
    offset += 12;
    for (let v = 0; v < 3; v++) {
      const p = t * 9 + v * 3;
      positions[p] = view.getFloat32(offset, true);
      positions[p + 1] = view.getFloat32(offset + 4, true);
      positions[p + 2] = view.getFloat32(offset + 8, true);
      normals[p] = nx;
      normals[p + 1] = ny;
      normals[p + 2] = nz;
      offset += 12;
    }
    offset += 2; // attribute byte count
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  return geom;
}

export default function StlViewer({ stl }: { stl: ArrayBuffer }) {
  const mountEl = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mountEl.current;
    if (!el) return;

    const width = el.clientWidth;
    const height = el.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x11161c);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    el.appendChild(renderer.domElement);

    // Model is built in mm with Z up. Convert to three.js Y-up by rotating.
    const geometry = parseBinarySTL(stl);
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox!;
    const center = new THREE.Vector3();
    bb.getCenter(center);
    const size = new THREE.Vector3();
    bb.getSize(size);

    const material = new THREE.MeshStandardMaterial({
      color: 0xff6a00,
      roughness: 0.65,
      metalness: 0.05,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    // Center X/Y on origin but keep the base at z=0 so it rests on the grid;
    // the pivot then lays this Z-up model flat in three's Y-up world.
    mesh.position.set(-center.x, -center.y, -bb.min.z);
    const pivot = new THREE.Group();
    pivot.add(mesh);
    pivot.rotation.x = -Math.PI / 2;
    scene.add(pivot);

    // Lighting
    scene.add(new THREE.HemisphereLight(0xffffff, 0x33404d, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(1, 2, 1.5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-1.5, 1, -1);
    scene.add(fill);

    // Ground grid sized to the model footprint.
    const footprint = Math.max(size.x, size.y);
    const grid = new THREE.GridHelper(footprint * 1.6, 20, 0x3a4654, 0x222b33);
    grid.position.y = 0;
    scene.add(grid);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Frame the model.
    const radius = Math.max(size.x, size.y, size.z);
    camera.position.set(radius * 0.9, radius * 0.9, radius * 1.2);
    controls.target.set(0, size.z / 2, 0);
    controls.update();

    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [stl]);

  return <div ref={mountEl} style={{ width: "100%", height: "100%" }} />;
}
