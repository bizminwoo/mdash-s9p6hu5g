// 매시간 실행 → 각 곡의 총 조회수/좋아요를 수집해 저장하고 index.html(대시보드) + bep.html 갱신
// 조회수 수집: YT_API_KEY 환경변수가 있으면 YouTube 공식 Data API(배치), 없으면 yt-dlp(로컬 PC 폴백)
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(ROOT, "data", "snapshots.json");
const TEMPLATE = join(ROOT, "dashboard.template.html");
const OUTPUT = join(ROOT, "index.html");

function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function localTime(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${localDate(d)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const vidOf = (u) => (u.match(/[?&]v=([\w-]{11})/) || u.match(/youtu\.be\/([\w-]{11})/) || [])[1];
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

// 여러 곡의 조회수/좋아요를 한 번에 — YouTube Data API (50개씩 배치, 호출당 1유닛)
async function fetchStatsAPI(ids) {
  const key = process.env.YT_API_KEY;
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${chunk.join(",")}&key=${key}`);
    if (!res.ok) throw new Error(`Data API HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const d = await res.json();
    for (const item of d.items || []) {
      out[item.id] = { views: num(item.statistics?.viewCount), likes: num(item.statistics?.likeCount) };
    }
  }
  return out;
}

// yt-dlp 폴백 (로컬 PC 전용 — config.mjs 가 있을 때만)
async function fetchStatsYtdlp(ids, urlOf) {
  const { YTDLP } = await import("./config.mjs");
  const out = {};
  for (const id of ids) {
    try {
      const line = execFileSync(YTDLP,
        ["--skip-download", "--no-warnings", "--print", "%(view_count)s\t%(like_count)s", urlOf(id)],
        { encoding: "utf8", timeout: 120000,
          env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" } }).trim();
      const [views, likes] = line.split("\t");
      out[id] = { views: num(views), likes: num(likes) };
    } catch (e) {
      console.log(`  ✗ 실패: ${id} — ${String(e.message).split("\n")[0]}`);
    }
  }
  return out;
}

async function main() {
  const renderOnly = process.argv.includes("--render");

  const songs = JSON.parse(readFileSync(join(ROOT, "songs.json"), "utf8"))
    .map((e) => (typeof e === "string" ? { url: e } : e))
    .filter((e) => e && typeof e.url === "string" && vidOf(e.url));

  const MKT_FILE = join(ROOT, "marketing.json");
  let marketing = [];
  if (existsSync(MKT_FILE)) {
    marketing = JSON.parse(readFileSync(MKT_FILE, "utf8"))
      .map((e) => (typeof e === "string" ? { url: e } : e))
      .filter((e) => e && typeof e.url === "string" && vidOf(e.url));
  }

  let db = { songs: {}, snapshots: [] };
  if (existsSync(DATA_FILE)) db = JSON.parse(readFileSync(DATA_FILE, "utf8"));

  // songs.json 의 제목/수익비율(share)을 항상 반영
  for (const { url, title, share } of songs) {
    const vid = vidOf(url);
    db.songs[vid] = { ...(db.songs[vid] || {}), url,
      ...(title ? { title } : {}), share: share == null ? 1 : share };
  }
  // 마케팅 트랙 반영 + marketing.json 에서 빠진 트랙은 목록에서 제거
  for (const { url, title, start } of marketing) {
    const vid = vidOf(url);
    db.songs[vid] = { ...(db.songs[vid] || {}), url, ...(title ? { title } : {}),
      marketing: true, ...(start ? { start } : {}) };
  }
  const mktVids = new Set(marketing.map((e) => vidOf(e.url)));
  for (const [vid, s] of Object.entries(db.songs)) {
    if (s.marketing && !mktVids.has(vid)) delete db.songs[vid];
  }

  if (!renderOnly) {
    const today = localDate();
    const all = [...songs, ...marketing];
    const ids = all.map((e) => vidOf(e.url));
    const urlOf = (id) => all[ids.indexOf(id)].url;
    console.log(`[${localTime()}] ${songs.length}곡 + 마케팅 ${marketing.length}트랙 수집 (${process.env.YT_API_KEY ? "Data API" : "yt-dlp"})...`);

    const stats = process.env.YT_API_KEY ? await fetchStatsAPI(ids) : await fetchStatsYtdlp(ids, urlOf);
    for (const [vid, s] of Object.entries(stats)) {
      const name = db.songs[vid]?.title || vid;
      console.log(`  ✓ ${name}  (조회 ${s.views?.toLocaleString() ?? "?"}, 좋아요 ${s.likes?.toLocaleString() ?? "?"})`);
    }
    const missing = ids.filter((id) => !stats[id]);
    if (missing.length) console.log(`  ⚠ 수집 실패: ${missing.join(", ")}`);

    // 오늘의 기준값(하루 첫 수집 = 00시)은 유지, 신규 곡 기준값만 추가
    const idx = db.snapshots.findIndex((s) => s.date === today);
    if (idx >= 0) {
      for (const [vid, s] of Object.entries(stats)) {
        if (!db.snapshots[idx].stats[vid]) db.snapshots[idx].stats[vid] = s;
      }
    } else {
      db.snapshots.push({ date: today, time: localTime(), stats });
    }
    db.current = { time: localTime(), stats };
    db.snapshots.sort((a, b) => (a.date < b.date ? -1 : 1));

    // 시간별 스냅샷 — "어제 동시간대" 비교용 (조회수만, 최근 8일 유지)
    const hh = String(new Date().getHours()).padStart(2, "0");
    db.hourly = db.hourly || {};
    (db.hourly[today] = db.hourly[today] || {})[hh] = Object.fromEntries(
      Object.entries(stats).filter(([, s]) => s.views != null).map(([vid, s]) => [vid, s.views]));
    const cutoff = localDate(new Date(Date.now() - 8 * 86400000));
    for (const d of Object.keys(db.hourly)) if (d < cutoff) delete db.hourly[d];

    writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
  }

  // index.html (대시보드) 생성
  const SP_FILE = join(ROOT, "data", "spotify.json");
  const sp = existsSync(SP_FILE) ? readFileSync(SP_FILE, "utf8") : "null";
  const tpl = readFileSync(TEMPLATE, "utf8");
  writeFileSync(OUTPUT, tpl.replace("/*__DATA__*/ null", JSON.stringify(db))
    .replace("/*__SP__*/ null", sp), "utf8");

  // bep.html 생성
  const BEP_TEMPLATE = join(ROOT, "bep.template.html");
  if (existsSync(BEP_TEMPLATE)) {
    const EXP_FILE = join(ROOT, "experiments.json");
    const experiments = existsSync(EXP_FILE) ? JSON.parse(readFileSync(EXP_FILE, "utf8")) : [];
    writeFileSync(join(ROOT, "bep.html"),
      readFileSync(BEP_TEMPLATE, "utf8")
        .replace("/*__DATA__*/ null", JSON.stringify(db))
        .replace("/*__EXP__*/ null", JSON.stringify(experiments)), "utf8");
  }

  console.log(`[완료] 저장: data/snapshots.json,  페이지: index.html + bep.html`);
}

await main();
