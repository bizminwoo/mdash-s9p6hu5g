// 매시간 실행 → 각 곡의 총 조회수/좋아요를 수집해 저장하고 index.html(대시보드) + bep.html 갱신
// 조회수 수집: YT_API_KEY 환경변수가 있으면 YouTube 공식 Data API(배치), 없으면 yt-dlp(로컬 PC 폴백)
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { navHtml } from "./nav.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(ROOT, "data", "snapshots.json");
const TEMPLATE = join(ROOT, "dashboard.template.html");
const OUTPUT = join(ROOT, "index.html");
// 🤖 AI 음원 대시보드 — 내 곡과 같은 템플릿·같은 형식이지만 데이터셋이 완전히 분리돼 있다
const AI_SONGS_FILE = join(ROOT, "ai-songs.json");
const AI_DATA_FILE = join(ROOT, "data", "ai-snapshots.json");
const AI_OUTPUT = join(ROOT, "ai.html");
// 💛 좋아요 구매 이력 — 대시보드 그래프에 "구매한 날"을 표시하기 위한 목록
// 저장소 파일(likes-purchases.json)이 원본. 주 PC에서 돌 때는 구매봇 장부에서 새 기록을 합쳐 넣는다.
const BUYS_FILE = join(ROOT, "likes-purchases.json");
const BUY_LEDGERS = ["C:/snshelper-bot/likes_purchased.json"];

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
      out[item.id] = { views: num(item.statistics?.viewCount), likes: num(item.statistics?.likeCount), comments: num(item.statistics?.commentCount) };
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
        ["--skip-download", "--no-warnings", "--print", "%(view_count)s\t%(like_count)s\t%(comment_count)s", urlOf(id)],
        { encoding: "utf8", timeout: 120000,
          env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" } }).trim();
      const [views, likes, comments] = line.split("\t");
      out[id] = { views: num(views), likes: num(likes), comments: num(comments) };
    } catch (e) {
      console.log(`  ✗ 실패: ${id} — ${String(e.message).split("\n")[0]}`);
    }
  }
  return out;
}

// 수집 결과를 데이터셋에 반영 — 날짜별 스냅샷(그날 첫 수집으로 고정) + 시간별 칸(그 시간 첫 수집만) + 현재값
function applyStats(db, stats) {
  const today = localDate();
  const idx = db.snapshots.findIndex((s) => s.date === today);
  if (idx >= 0) {
    // 오늘 기준값은 유지하고 신규 곡 기준값만 추가 (locked 스냅샷도 이 규칙으로 보호된다)
    for (const [vid, s] of Object.entries(stats)) {
      if (!db.snapshots[idx].stats[vid]) db.snapshots[idx].stats[vid] = s;
    }
  } else {
    db.snapshots.push({ date: today, time: localTime(), stats });
  }
  db.current = { time: localTime(), stats };
  db.snapshots.sort((a, b) => (a.date < b.date ? -1 : 1));

  // 시간별 스냅샷 — "어제 동시간대" 비교용 (조회수만, 최근 8일 유지)
  // 같은 시간에 여러 번 실행돼도 "그 시간의 첫 수집"만 기록 → 시간대 비교 기준이 일정하고,
  // 5분 예약이 누락되면 25분/45분 백업 실행이 그 시간 칸을 자동으로 채움
  const hh = String(new Date().getHours()).padStart(2, "0");
  db.hourly = db.hourly || {};
  const hcur = (db.hourly[today] = db.hourly[today] || {});
  if (!hcur[hh]) {
    hcur[hh] = Object.fromEntries(
      Object.entries(stats).filter(([, s]) => s.views != null).map(([vid, s]) => [vid, s.views]));
    // 수집된 "분"도 기록 → 대시보드가 정각(H:00) 값으로 비례 환산할 때 사용
    db.hourlyMin = db.hourlyMin || {};
    (db.hourlyMin[today] = db.hourlyMin[today] || {})[hh] = new Date().getMinutes();
  }
  const cutoff = localDate(new Date(Date.now() - 8 * 86400000));
  for (const d of Object.keys(db.hourly)) if (d < cutoff) delete db.hourly[d];
  for (const d of Object.keys(db.hourlyMin || {})) if (d < cutoff) delete db.hourlyMin[d];
}

// 좋아요 구매 이력 { 영상id: ["YYYY-MM-DD", ...] } 을 읽고, 구매봇 장부가 있으면 새 기록을 합친다.
// GitHub Actions 처럼 장부가 없는 환경에서는 저장소 파일만 읽고 끝낸다.
function loadLikesBuys() {
  let buys = {};
  if (existsSync(BUYS_FILE)) {
    try { buys = JSON.parse(readFileSync(BUYS_FILE, "utf8")) || {}; } catch { buys = {}; }
  }
  let added = 0;
  for (const led of BUY_LEDGERS) {
    if (!existsSync(led)) continue;
    try {
      const rows = JSON.parse(readFileSync(led, "utf8"))?.purchased || [];
      for (const r of rows) {
        if (!r?.v || !r?.at) continue;
        const list = (buys[r.v] = buys[r.v] || []);
        if (!list.includes(r.at)) { list.push(r.at); added++; }
      }
    } catch { /* 장부가 깨져 있어도 대시보드 생성은 계속 */ }
  }
  if (added) {
    for (const k of Object.keys(buys)) buys[k].sort();
    writeFileSync(BUYS_FILE, JSON.stringify(buys, null, 1), "utf8");
    console.log(`  💛 좋아요 구매 이력 ${added}건 새로 반영`);
  }
  return buys;
}

// 대시보드 템플릿의 자리표시자 채우기 (데이터 + 상단 탭 + 제목)
function fillPage(tpl, db, sp, { nav, h1, title }) {
  return tpl
    .replace("/*__DATA__*/ null", () => JSON.stringify(db))
    .replace("/*__SP__*/ null", () => sp)
    .replace("<!--__NAV__-->", () => nav)
    .replace("<!--__H1__-->", () => h1)
    .replace("<!--__PAGETITLE__-->", () => title);
}

// 🤖 AI 음원 대시보드: ai-songs.json → data/ai-snapshots.json → ai.html
// 내 곡 대시보드와 같은 템플릿을 쓰지만 데이터가 분리돼 있어 합계가 서로 섞이지 않는다.
async function buildAi(renderOnly, tpl) {
  const songs = existsSync(AI_SONGS_FILE)
    ? JSON.parse(readFileSync(AI_SONGS_FILE, "utf8"))
        .map((e) => (typeof e === "string" ? { url: e } : e))
        .filter((e) => e && typeof e.url === "string" && vidOf(e.url))
    : [];

  let db = { songs: {}, snapshots: [] };
  if (existsSync(AI_DATA_FILE)) db = JSON.parse(readFileSync(AI_DATA_FILE, "utf8"));

  for (const { url, title, share, adViews } of songs) {
    const vid = vidOf(url);
    db.songs[vid] = { ...(db.songs[vid] || {}), url,
      ...(title ? { title } : {}), share: share == null ? 1 : share };
    if (adViews) db.songs[vid].adViews = true; else delete db.songs[vid].adViews;
  }
  // ai-songs.json 에서 지운 곡은 목록에서 빠진다 (과거 스냅샷 수치는 그대로 남음)
  const keep = new Set(songs.map((e) => vidOf(e.url)));
  for (const vid of Object.keys(db.songs)) if (!keep.has(vid)) delete db.songs[vid];

  if (!renderOnly && songs.length) {
    const ids = songs.map((e) => vidOf(e.url));
    const urlOf = (id) => songs[ids.indexOf(id)].url;
    console.log(`[${localTime()}] AI 음원 ${songs.length}곡 수집...`);
    const stats = process.env.YT_API_KEY ? await fetchStatsAPI(ids) : await fetchStatsYtdlp(ids, urlOf);
    for (const [vid, s] of Object.entries(stats)) {
      console.log(`  ✓ ${db.songs[vid]?.title || vid}  (조회 ${s.views?.toLocaleString() ?? "?"}, 좋아요 ${s.likes?.toLocaleString() ?? "?"})`);
    }
    const missing = ids.filter((id) => !stats[id]);
    if (missing.length) console.log(`  ⚠ 수집 실패: ${missing.join(", ")}`);
    applyStats(db, stats);
    writeFileSync(AI_DATA_FILE, JSON.stringify(db, null, 2), "utf8");
  }

  db.likesBuys = loadLikesBuys();   // 화면 표시용 (data/ai-snapshots.json 에는 저장 안 됨)
  writeFileSync(AI_OUTPUT, fillPage(tpl, db, "null", {
    nav: navHtml("ai.html"),
    h1: "🤖 AI 음원 대시보드 · 유튜브뮤직",
    title: "AI 음원 대시보드 · 유튜브뮤직",
  }), "utf8");
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

  // songs.json 의 제목/수익비율(share)/광고플래그(adViews)를 항상 반영
  for (const { url, title, share, adViews } of songs) {
    const vid = vidOf(url);
    db.songs[vid] = { ...(db.songs[vid] || {}), url,
      ...(title ? { title } : {}), share: share == null ? 1 : share };
    if (adViews) db.songs[vid].adViews = true; else delete db.songs[vid].adViews;
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

    applyStats(db, stats);
    writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
  }

  // index.html (대시보드) 생성
  const SP_FILE = join(ROOT, "data", "spotify.json");
  const sp = existsSync(SP_FILE) ? readFileSync(SP_FILE, "utf8") : "null";
  const tpl = readFileSync(TEMPLATE, "utf8");
  writeFileSync(OUTPUT, fillPage(tpl, db, sp, {
    nav: navHtml("index.html"),
    h1: "🎵 내 음원 대시보드 · 유튜브뮤직",
    title: "내 음원 대시보드 · 유튜브뮤직",
  }), "utf8");

  // ai.html (AI 음원 대시보드) 생성 — 같은 템플릿, 분리된 데이터
  await buildAi(renderOnly, tpl);

  // bep.html 생성 (상단 탭에서는 뺐지만 주소로는 계속 접근 가능)
  const BEP_TEMPLATE = join(ROOT, "bep.template.html");
  if (existsSync(BEP_TEMPLATE)) {
    const EXP_FILE = join(ROOT, "experiments.json");
    const experiments = existsSync(EXP_FILE) ? JSON.parse(readFileSync(EXP_FILE, "utf8")) : [];
    writeFileSync(join(ROOT, "bep.html"),
      readFileSync(BEP_TEMPLATE, "utf8")
        .replace("/*__DATA__*/ null", () => JSON.stringify(db))
        .replace("/*__EXP__*/ null", () => JSON.stringify(experiments))
        .replace("<!--__NAV__-->", () => navHtml("bep.html")), "utf8");
  }

  console.log(`[완료] 저장: data/snapshots.json + data/ai-snapshots.json,  페이지: index.html + ai.html + bep.html`);
}

await main();
