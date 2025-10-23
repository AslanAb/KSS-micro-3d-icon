"use client";

import React, { useRef, useEffect } from "react";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";

type FacetBall3DProps = {
  size?: number;
  rotate?: boolean;
  isPlaying?: boolean;
  playbackLevel?: number; // 0..~1 from analyser of <audio>
  className?: string;
};

export default function FacetBall3D({
  size = 84,
  rotate = false,
  isPlaying = false,
  playbackLevel = 0,
  className,
}: FacetBall3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const lineMaterialRef = useRef<LineMaterial | null>(null);

  // Refs to store props to use them in animation loop without re-triggering useEffect
  const propsRef = useRef({ rotate, isPlaying, playbackLevel });
  useEffect(() => {
    propsRef.current = { rotate, isPlaying, playbackLevel };
  });

  useEffect(() => {
    if (!mountRef.current) return;

    const currentMount = mountRef.current;

    // Scene setup
    const scene = new THREE.Scene();

    // Camera setup
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.z = 2.5;
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(size, size);
    renderer.setClearColor(0x000000, 0);
    rendererRef.current = renderer;
    currentMount.appendChild(renderer.domElement);

    // Create geometry with facets
    const geometry = new THREE.IcosahedronGeometry(1.2, 2); // Increased detail for more facets

    // Create material for the main sphere
    const material = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      shininess: 100,
      specular: 0xffffff,
      flatShading: true,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 1,
    });

    // Create mesh
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    // Create thick wireframe using Line2
    const edges = new THREE.EdgesGeometry(geometry);
    const lineGeom = new LineGeometry();
    lineGeom.setPositions(Array.from(edges.attributes.position.array as Iterable<number>));

    const lineMat = new LineMaterial({
      color: 0xff0000,
      linewidth: 0.4, // world units
      resolution: new THREE.Vector2(size, size),
    });
    lineMaterialRef.current = lineMat;

    const wireframe = new Line2(lineGeom, lineMat);
    sphere.add(wireframe);

    // Create circular texture for points
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.arc(32, 32, 30, 0, Math.PI * 2);
      ctx.fillStyle = "#ff0000";
      ctx.fill();
    }
    const pointTexture = new THREE.CanvasTexture(canvas);

    // Create points for vertices
    const pointsMaterial = new THREE.PointsMaterial({
      size: 0.07,
      map: pointTexture,
      transparent: true,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geometry, pointsMaterial);
    sphere.add(points);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2); // Reduced ambient light
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5); // Increased intensity
    directionalLight.position.set(-10, 10, 10).normalize(); // Pointing from the camera
    scene.add(directionalLight);

    const pointLight = new THREE.PointLight(0xffffff, 0.5);
    pointLight.position.set(10, 10, 10);
    scene.add(pointLight);

    // Animation loop
    const animate = (time?: number) => {
      animationFrameRef.current = requestAnimationFrame(animate);
      const { rotate, isPlaying, playbackLevel } = propsRef.current;

      // playback-driven animation: gentle pulsing + rotation
      if (isPlaying && sphere) {
        // Map playbackLevel (RMS) to pulse; no base offset so scale==1 at silence
        const lvl = Math.min(1, Math.max(0, playbackLevel));
        const pulse = 1 + lvl * 0.2; // increase only with sound level
        sphere.scale.setScalar(pulse);
        sphere.rotation.x += 0.003;
        sphere.rotation.y += 0.004;
        sphere.rotation.z += 0.002;
      } else {
        // when not playing, keep scale at 1 (no mic-driven scaling)
        sphere.scale.setScalar(1);
      }

      // Optional continuous slow spin on hover/record (no scaling)
      if (rotate && sphere) {
        sphere.rotation.x += 0.003;
        sphere.rotation.y += 0.004;
        sphere.rotation.z += 0.002;
      }

      renderer.render(scene, camera);
    };

    animate();

    // Cleanup
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (renderer && currentMount) {
        if (currentMount.contains(renderer.domElement)) currentMount.removeChild(renderer.domElement);
        renderer.dispose();
      }
    };
  }, [size]);

  // Keep Line2 thickness correct on resize
  useEffect(() => {
    if (rendererRef.current && cameraRef.current && lineMaterialRef.current) {
      const w = mountRef.current?.getBoundingClientRect().width || size;
      rendererRef.current.setSize(w, w);
      cameraRef.current.aspect = 1;
      cameraRef.current.updateProjectionMatrix();
      lineMaterialRef.current.resolution.set(w, w);
    }
  }, [size]);

  return (
    <div
      ref={mountRef}
      className={className}
      style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden" }}
      aria-label="3D Recording ball"
    />
  );
}
