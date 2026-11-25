"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Map as MapboxMap, Marker as MapboxMarker } from "mapbox-gl";
import { NO_INFO_MAP } from "@/lib/levels";
import type { LngLat } from "@/lib/types";

export type MapSel = { type: "spot" | "road" | "report"; id: string } | null;

export interface MapPoint {
  id: string;
  type: "spot" | "road" | "report";
  coords: LngLat;
  /** マーカー内の記号 */
  mark: string;
  label?: string;
  /** 右上のバッジ（混雑度の1文字と色） */
  badge?: { text: string; color: string } | null;
  variant?: "default" | "filled" | "dark" | "round" | "report";
}

export interface MapLine {
  id: string;
  coords: LngLat[];
  color: string;
  width?: number;
}

interface Props {
  points: MapPoint[];
  lines?: MapLine[];
  selected?: MapSel;
  onSelect?: (sel: MapSel) => void;
  /** 変わったときに全体が収まるよう表示範囲を合わせる */
  fitKey?: string;
  fitCoords?: LngLat[];
  /** 上下の余白（ヘッダーや下部カードに隠れないように） */
  padding?: { top: number; bottom: number; left: number; right: number };
  geolocate?: boolean;
  /** 地図の中心が変わったとき（現場報告の「地図の中心」用） */
  onCenter?: (c: LngLat) => void;
  className?: string;
  ariaLabel?: string;
}

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const STYLE_LIGHT = "mapbox://styles/mapbox/light-v11";
const STYLE_DARK = "mapbox://styles/mapbox/dark-v11";
const isDark = () => document.documentElement.classList.contains("dark");

function markerEl(p: MapPoint, selected: boolean, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `r42-marker r42-${p.variant ?? "default"}${selected ? " r42-sel" : ""}`;
  el.setAttribute("aria-label", p.label ?? p.mark);
  const seal = document.createElement("span");
  seal.className = "r42-seal";
  seal.textContent = p.mark;
  el.append(seal);
  if (p.badge) {
    const b = document.createElement("span");
    b.className = "r42-badge";
    b.textContent = p.badge.text;
    b.style.background = p.badge.color;
    el.append(b);
  }
  if (p.label) {
    const l = document.createElement("span");
    l.className = "r42-label";
    l.textContent = p.label;
    el.append(l);
  }
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return el;
}

export default function MapView({
  points,
  lines = [],
  selected = null,
  onSelect,
  fitKey,
  fitCoords,
  padding = { top: 40, bottom: 40, left: 40, right: 40 },
  geolocate,
  onCenter,
  className = "",
  ariaLabel = "地図",
}: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const glRef = useRef<typeof import("mapbox-gl").default | null>(null);
  const markers = useRef<MapboxMarker[]>([]);
  const linesRef = useRef<MapLine[]>(lines);
  const [ready, setReady] = useState(false);
  linesRef.current = lines;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onCenterRef = useRef(onCenter);
  onCenterRef.current = onCenter;

  // 地図の作成（1回だけ）
  useEffect(() => {
    if (!TOKEN || !box.current) return;
    let map: MapboxMap | null = null;
    let observer: MutationObserver | null = null;
    let cancelled = false;
    import("mapbox-gl").then((mod) => {
      if (cancelled || !box.current) return;
      const mapboxgl = mod.default;
      glRef.current = mapboxgl;
      mapboxgl.accessToken = TOKEN;
      map = new mapboxgl.Map({
        container: box.current,
        style: isDark() ? STYLE_DARK : STYLE_LIGHT,
        center: [135.8, 33.52],
        zoom: 9.5,
        attributionControl: true,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      if (geolocate) {
        map.addControl(
          new mapboxgl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showUserHeading: true }),
          "top-right"
        );
      }
      map.on("click", () => onSelectRef.current?.(null));
      map.on("moveend", () => {
        const c = map!.getCenter();
        onCenterRef.current?.([c.lng, c.lat]);
      });
      // 線はスタイルの読み込みごと（テーマ切替を含む）に追加し直す
      map.on("style.load", () => {
        drawLines(map!, linesRef.current);
        setReady(true);
      });
      mapRef.current = map;
      // テーマ（html.dark）の切替に地図の配色も合わせる
      observer = new MutationObserver(() => {
        const want = isDark() ? STYLE_DARK : STYLE_LIGHT;
        if (map && (map as unknown as { _r42style?: string })._r42style !== want) {
          (map as unknown as { _r42style?: string })._r42style = want;
          map.setStyle(want);
        }
      });
      (map as unknown as { _r42style?: string })._r42style = isDark() ? STYLE_DARK : STYLE_LIGHT;
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    });
    return () => {
      cancelled = true;
      observer?.disconnect();
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      map?.remove();
      mapRef.current = null;
    };
  }, [geolocate]);

  // 線の更新
  useEffect(() => {
    if (ready && mapRef.current) drawLines(mapRef.current, lines);
  }, [lines, ready]);

  // マーカーの更新
  useEffect(() => {
    const map = mapRef.current;
    const gl = glRef.current;
    if (!ready || !map || !gl) return;
    markers.current.forEach((m) => m.remove());
    markers.current = points.map((p) =>
      new gl.Marker({
        element: markerEl(p, !!selected && selected.type === p.type && selected.id === p.id, () =>
          onSelectRef.current?.({ type: p.type, id: p.id })
        ),
        anchor: "top",
        offset: [0, -14],
      })
        .setLngLat(p.coords)
        .addTo(map)
    );
  }, [points, selected, ready]);

  // 表示範囲を合わせる
  useEffect(() => {
    const map = mapRef.current;
    const gl = glRef.current;
    const cs = fitCoords ?? points.map((p) => p.coords);
    if (!ready || !map || !gl || !cs.length) return;
    const b = new gl.LngLatBounds(cs[0], cs[0]);
    cs.forEach((c) => b.extend(c));
    map.fitBounds(b, { padding, duration: 600, maxZoom: 13 });
    // fitKey が変わったときだけ合わせる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, ready]);

  // 選択したものへ移動
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !selected) return;
    const p = points.find((x) => x.type === selected.type && x.id === selected.id);
    if (p) map.easeTo({ center: p.coords, zoom: Math.max(map.getZoom(), 12), padding, duration: 500 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.type, selected?.id, ready]);

  if (!TOKEN) {
    return (
      <div className={`flex items-center justify-center bg-fill text-[15px] text-label-2 ${className}`}>
        地図を表示できません（NEXT_PUBLIC_MAPBOX_TOKEN が未設定）
      </div>
    );
  }
  return <div ref={box} className={className} role="region" aria-label={ariaLabel} />;
}

function drawLines(map: MapboxMap, lines: MapLine[]) {
  const data = {
    type: "FeatureCollection" as const,
    features: lines.map((l) => ({
      type: "Feature" as const,
      properties: { color: l.color || NO_INFO_MAP, width: l.width ?? 5 },
      geometry: { type: "LineString" as const, coordinates: l.coords },
    })),
  };
  const src = map.getSource("r42-lines") as { setData?: (d: unknown) => void } | undefined;
  if (src?.setData) {
    src.setData(data);
    return;
  }
  if (!map.isStyleLoaded()) return;
  map.addSource("r42-lines", { type: "geojson", data });
  map.addLayer({
    id: "r42-lines-casing",
    type: "line",
    source: "r42-lines",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": "#ffffff", "line-width": ["+", ["get", "width"], 4] },
  });
  map.addLayer({
    id: "r42-lines",
    type: "line",
    source: "r42-lines",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": ["get", "color"], "line-width": ["get", "width"] },
  });
}
