// 스포티파이 인기도 점수(0~100) 수집 → data/spotify.json
// 대상: songs.json + competitors.json 의 모든 곡. 트랙 매칭은 "가수 - 제목" 검색으로 자동 (결과는 캐시).
// 잘못 매칭된 곡은 해당 json 항목에 "spotify": "<트랙ID>" 를 넣으면 그걸로 고정.
// SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET 없으면 조용히 건너뜀.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(ROOT, "data", "spotify.json");
const ID = process.env.SPOTIFY_CLIENT_ID, SECRET = process.env.SPOTIFY_CLIENT_SECRET;
if (!ID || !SECRET) { console.log("[스포티파이] 키 없음 — 건너뜀"); process.exit(0); }

function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function localTime(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${localDate(d)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const vidOf = (u) => (u.match(/[?&]v=([\w-]{11})/) || u.match(/youtu\.be\/([\w-]{11})/) || [])[1];

async function getToken() {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${ID}:${SECRET}`).toString("base64") },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`토큰 HTTP ${res.status}`);
  return (await res.json()).access_token;
}

async function main() {
  // 추적 대상: songs.json + competitors.json (마케팅 트랙 제외 — 커버곡·비정규 음원이 많아 매칭 불가)
  const load = (f) => existsSync(join(ROOT, f))
    ? JSON.parse(readFileSync(join(ROOT, f), "utf8"))
        .map((e) => (typeof e === "string" ? { url: e } : e))
        .filter((e) => e && typeof e.url === "string" && vidOf(e.url))
    : [];
  const entries = [...load("songs.json"), ...load("competitors.json")]
    .map((e) => ({ key: vidOf(e.url), title: e.title || "", spotify: e.spotify || null }))
    .filter((e) => e.title);

  let db = { tracks: {}, snapshots: [] };
  if (existsSync(DATA_FILE)) db = JSON.parse(readFileSync(DATA_FILE, "utf8"));

  const token = await getToken();
  const H = { Authorization: `Bearer ${token}` };
  console.log(`[${localTime()}] 스포티파이 인기도 수집 (${entries.length}곡)...`);

  // 1) 트랙 매칭 (캐시 우선, json의 spotify 필드가 있으면 그걸로 고정)
  for (const e of entries) {
    const cached = db.tracks[e.key];
    if (e.spotify) {
      if (!cached || cached.spId !== e.spotify) db.tracks[e.key] = { spId: e.spotify, manual: true };
      continue;
    }
    if (cached?.spId) continue; // 매칭 실패(notFound)는 다음 실행 때 재시도
    // "가수 - 제목" → track/artist 분리 검색, 실패 시 통짜 검색
    const [artist, ...rest] = e.title.split(" - ");
    const track = rest.join(" - ").replace(/\(.*?\)/g, "").trim();
    const tries = track ? [`track:"${track}" artist:"${artist}"`, `${artist} ${track}`, e.title] : [e.title];
    let hit = null;
    for (const q of tries) {
      const res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&market=KR&limit=3`, { headers: H });
      if (!res.ok) {
        console.log(`  ⚠ 검색 HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        continue;
      }
      const items = (await res.json()).tracks?.items || [];
      if (items.length) { hit = items[0]; break; }
    }
    if (hit) {
      db.tracks[e.key] = { spId: hit.id, name: hit.name, artist: hit.artists.map(a => a.name).join(", ") };
      console.log(`  ⊕ 매칭: ${e.title} → ${db.tracks[e.key].artist} - ${hit.name}`);
    } else {
      db.tracks[e.key] = { notFound: true };
      console.log(`  ✗ 매칭 실패: ${e.title}`);
    }
  }
  // 추적 대상에서 빠진 곡은 정리
  const keys = new Set(entries.map((e) => e.key));
  for (const k of Object.keys(db.tracks)) if (!keys.has(k)) delete db.tracks[k];

  // 2) 인기도 수집 (50개씩 배치)
  const mapped = Object.entries(db.tracks).filter(([, t]) => t.spId);
  const pop = {};
  for (let i = 0; i < mapped.length; i += 50) {
    const chunk = mapped.slice(i, i + 50);
    const res = await fetch(`https://api.spotify.com/v1/tracks?ids=${chunk.map(([, t]) => t.spId).join(",")}`, { headers: H });
    if (!res.ok) throw new Error(`tracks HTTP ${res.status}`);
    const d = await res.json();
    d.tracks.forEach((tr, j) => { if (tr) pop[chunk[j][0]] = tr.popularity; });
  }
  console.log(`  ✓ 인기도 ${Object.keys(pop).length}/${entries.length}곡`);

  // 3) 스냅샷 (하루 첫 수집 = 기준값) + current
  const today = localDate();
  const idx = db.snapshots.findIndex((s) => s.date === today);
  if (idx >= 0) {
    for (const [k, v] of Object.entries(pop)) {
      if (db.snapshots[idx].pop[k] == null) db.snapshots[idx].pop[k] = v;
    }
  } else {
    db.snapshots.push({ date: today, time: localTime(), pop });
  }
  db.current = { time: localTime(), pop };
  db.snapshots.sort((a, b) => (a.date < b.date ? -1 : 1));
  const cutoff = localDate(new Date(Date.now() - 180 * 86400000));
  db.snapshots = db.snapshots.filter((s) => s.date >= cutoff);

  writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
  console.log(`[완료] 저장: data/spotify.json`);
}

await main();
