// 巡礼ルートの道路形状と区間距離・時間を data/route.json に保存する。
// 利用者ごとの Directions API 呼び出しをなくすため、札所を変えたら一度だけ実行する。
// 使い方: MAPBOX_TOKEN=pk.xxx node tools/build-route.mjs
import { readFile, writeFile } from 'node:fs/promises';

const token = process.env.MAPBOX_TOKEN;
if (!token) {
    console.error('MAPBOX_TOKEN を指定してください');
    process.exit(1);
}

const root = new URL('../', import.meta.url);
const spots = JSON.parse(await readFile(new URL('data/spots.json', root), 'utf8')).pilgrim;
const wp = spots.map((s) => s.coords.join(',')).join(';');
const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${wp}?geometries=geojson&overview=full&access_token=${token}`;

const res = await fetch(url);
if (!res.ok) {
    console.error('Directions API error:', res.status, await res.text());
    process.exit(1);
}
const json = await res.json();
const route = json.routes && json.routes[0];
if (!route) {
    console.error('ルートが見つかりません:', json.code, json.message);
    process.exit(1);
}

const out = {
    generatedAt: new Date().toISOString(),
    spots: spots.map((s) => s.id),
    coordinates: route.geometry.coordinates.map(([x, y]) => [Number(x.toFixed(5)), Number(y.toFixed(5))]),
    legs: route.legs.map((l) => ({ distance: Math.round(l.distance), duration: Math.round(l.duration) }))
};
await writeFile(new URL('data/route.json', root), JSON.stringify(out) + '\n');
console.log(`data/route.json: ${out.coordinates.length} 点, ${out.legs.length} 区間, 計 ${(route.distance / 1000).toFixed(1)}km`);
