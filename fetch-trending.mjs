// 유튜브 차트 "인기 급상승 뮤직비디오"(한국) 추적 → data/trending.json 저장 + trending.html 생성
// 차트 목록: charts.youtube.com 내부 API / 조회수: youtube.com 내부 API (yt-dlp 불필요, 전부 HTTP)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(ROOT, "data", "trending.json");
const TEMPLATE = join(ROOT, "trending.template.html");
const OUTPUT = join(ROOT, "trending.html");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const KEEP_DAYS = 14;   // 차트에서 빠진 뒤에도 이 기간 동안은 계속 수집 (차트아웃 후 추이 확인용)
const SNAP_DAYS = 120;  // 스냅샷 보관 기간

function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function localTime(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${localDate(d)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 차트 목록 (30곡: id, 순위, 제목, 아티스트, 발매일)
async function fetchChart() {
  const res = await fetch("https://charts.youtube.com/youtubei/v1/browse?alt=json", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA,
      "Referer": "https://charts.youtube.com/charts/TrendingVideos/kr" },
    body: JSON.stringify({
      context: { client: { clientName: "WEB_MUSIC_ANALYTICS", clientVersion: "2.0", hl: "ko", gl: "KR", theme: "MUSIC" } },
      browseId: "FEmusic_analytics_charts_home",
      query: "perspective=CHART_DETAILS&chart_params_country_code=kr&chart_params_chart_type=TRENDING_VIDEOS",
    }),
  });
  if (!res.ok) throw new Error(`차트 API HTTP ${res.status}`);
  const data = await res.json();
  const found = [];
  (function walk(o) {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o.videoViews)) found.push(o.videoViews);
    for (const k in o) walk(o[k]);
  })(data);
  const list = found.flat().filter((v) => v && v.id);
  if (!list.length) throw new Error("차트 응답에서 videoViews 를 찾지 못함 (응답 구조 변경?)");
  const p = (n) => String(n).padStart(2, "0");
  return list.map((v) => ({
    id: v.id,
    pos: v.chartEntryMetadata?.currentPosition ?? null,
    title: v.title || v.id,
    artist: (v.artists || []).map((a) => a.name).join(", ") || v.channelName || "",
    release: v.releaseDate ? `${v.releaseDate.year}-${p(v.releaseDate.month)}-${p(v.releaseDate.day)}` : null,
  })).sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99));
}

// 영상 하나의 총 조회수 (+ 제목/채널 — 경쟁사 곡 메타 채우기용)
async function fetchViews(id) {
  const res = await fetch("https://www.youtube.com/youtubei/v1/player", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({
      context: { client: { clientName: "WEB", clientVersion: "2.20260101.00.00", hl: "ko", gl: "KR" } },
      videoId: id,
    }),
  });
  if (!res.ok) throw new Error(`player API HTTP ${res.status}`);
  const d = await res.json();
  const n = Number(d?.videoDetails?.viewCount);
  return { views: Number.isFinite(n) ? n : null,
    title: d?.videoDetails?.title || null, author: d?.videoDetails?.author || null };
}

// 여러 곡 조회수+제목 배치 조회 — YouTube Data API (YT_API_KEY 있을 때, 50개씩 1유닛)
async function fetchAllViewsAPI(ids) {
  const key = process.env.YT_API_KEY;
  const stats = {}, meta = {};
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${chunk.join(",")}&key=${key}`);
    if (!res.ok) throw new Error(`Data API HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const d = await res.json();
    for (const item of d.items || []) {
      const n = Number(item.statistics?.viewCount);
      const lk = Number(item.statistics?.likeCount);
      if (Number.isFinite(n)) stats[item.id] = { views: n, ...(Number.isFinite(lk) ? { likes: lk } : {}) };
      meta[item.id] = { title: item.snippet?.title || null, author: item.snippet?.channelTitle || null };
    }
  }
  return { stats, meta };
}

// 동시 6개씩 조회수 수집 (meta = 제목/채널, 경쟁사 곡용) — API 키 없을 때 폴백
async function fetchAllViews(ids) {
  if (process.env.YT_API_KEY) return fetchAllViewsAPI(ids);
  const stats = {}, meta = {};
  let i = 0;
  async function worker() {
    while (i < ids.length) {
      const id = ids[i++];
      try {
        const r = await fetchViews(id);
        if (r.views != null) stats[id] = { views: r.views };
        meta[id] = r;
      } catch (e) {
        console.log(`  ✗ 조회수 실패: ${id} — ${String(e.message).split("\n")[0]}`);
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  return { stats, meta };
}

async function main() {
  const renderOnly = process.argv.includes("--render");

  let db = { videos: {}, snapshots: [], chartDates: {}, chartCurrent: null };
  if (existsSync(DATA_FILE)) db = JSON.parse(readFileSync(DATA_FILE, "utf8"));

  // 경쟁사·관심 곡 수동 추적: competitors.json 에 링크 추가 (줄을 지우면 다음 수집 때 목록에서 제거)
  const COMP_FILE = join(ROOT, "competitors.json");
  const vidOf = (u) => (u.match(/[?&]v=([\w-]{11})/) || u.match(/youtu\.be\/([\w-]{11})/) || [])[1];
  let comps = [];
  if (existsSync(COMP_FILE)) {
    comps = JSON.parse(readFileSync(COMP_FILE, "utf8"))
      .map((e) => (typeof e === "string" ? { url: e } : e))
      .filter((e) => e && typeof e.url === "string" && vidOf(e.url));
  }

  if (!renderOnly) {
    const today = localDate();
    console.log(`[${localTime()}] 인기 급상승 차트 수집 시작...`);
    const chart = await fetchChart();
    console.log(`  ✓ 차트 ${chart.length}곡`);

    // 곡 메타 갱신 (제목/아티스트/발매일, 차트 첫 진입일/마지막 목격일)
    for (const c of chart) {
      const v = db.videos[c.id] || {};
      db.videos[c.id] = { ...v, title: c.title, artist: c.artist, release: c.release,
        firstSeen: v.firstSeen || today, lastSeen: today, lastPos: c.pos };
    }
    // 경쟁사 곡 반영: watch 표시 (기간 제한 없이 계속 추적) + 파일에서 빠진 곡은 watch 해제
    const compIds = comps.map((c) => vidOf(c.url));
    comps.forEach((c, i) => {
      const id = compIds[i];
      const v = db.videos[id] || {};
      const nv = { ...v, watch: true, order: i, ...(c.title ? { title: c.title } : {}),
        ...(c.likes ? { likesTrack: true } : {}) };
      if (!c.likes) delete nv.likesTrack; // 파일에서 likes 플래그를 빼면 좋아요 추적 중단
      db.videos[id] = nv;
    });
    for (const [id, v] of Object.entries(db.videos)) {
      if (v.watch && !compIds.includes(id)) {
        delete v.watch; delete v.order;
        if (!v.lastSeen) delete db.videos[id]; // 차트 이력도 없으면 즉시 추적 종료
      }
    }

    // 차트에서 빠진 지 KEEP_DAYS 지난 곡은 추적 종료 (경쟁사 곡은 예외 — 계속 추적)
    const keepCutoff = localDate(new Date(Date.now() - KEEP_DAYS * 86400000));
    for (const [id, v] of Object.entries(db.videos)) {
      if (!v.watch && (v.lastSeen || "0") < keepCutoff) delete db.videos[id];
    }

    // 오늘 차트 구성: 하루 첫 수집 기준 고정 + 현재 차트는 항상 갱신
    if (!db.chartDates[today]) db.chartDates[today] = chart.map((c) => ({ id: c.id, pos: c.pos }));
    db.chartCurrent = { time: localTime(), entries: chart.map((c) => ({ id: c.id, pos: c.pos })) };

    // 조회수 수집: 현재 차트 + 차트아웃 추적 곡 + 경쟁사 곡 전부
    const ids = Object.keys(db.videos);
    const { stats, meta } = await fetchAllViews(ids);
    console.log(`  ✓ 조회수 ${Object.keys(stats).length}/${ids.length}곡`);

    // 경쟁사 곡의 빈 메타(제목/아티스트)는 영상 정보로 채움 (competitors.json 의 title 이 항상 우선)
    for (const [id, v] of Object.entries(db.videos)) {
      if (!v.watch || !meta[id]) continue;
      if (!v.title && meta[id].title) v.title = meta[id].title;
      if (!v.artist && meta[id].author) v.artist = meta[id].author;
    }

    // 오늘 기준값(하루 첫 수집)은 유지, 신규 곡 기준값만 추가
    const idx = db.snapshots.findIndex((s) => s.date === today);
    if (idx >= 0) {
      for (const [id, s] of Object.entries(stats)) {
        if (!db.snapshots[idx].stats[id]) db.snapshots[idx].stats[id] = s;
      }
    } else {
      db.snapshots.push({ date: today, time: localTime(), stats });
    }
    db.current = { time: localTime(), stats };
    db.snapshots.sort((a, b) => (a.date < b.date ? -1 : 1));

    // 시간별 상세 스냅샷 (likesTrack 곡: 스트리밍 + 좋아요) — "그 시간의 첫 수집"만 기록, 정각 환산용 분도 저장
    const hh = String(new Date().getHours()).padStart(2, "0");
    const writeHourly = (store, minStore, values) => {
      db[store] = db[store] || {};
      db[minStore] = db[minStore] || {};
      if (!Object.keys(values).length) return;
      const hcur = (db[store][today] = db[store][today] || {});
      if (!hcur[hh]) {
        hcur[hh] = values;
        (db[minStore][today] = db[minStore][today] || {})[hh] = new Date().getMinutes();
      } else {
        for (const [id, v] of Object.entries(values)) if (hcur[hh][id] == null) hcur[hh][id] = v;
      }
      const cutoff = localDate(new Date(Date.now() - 14 * 86400000));
      for (const d of Object.keys(db[store])) if (d < cutoff) delete db[store][d];
      for (const d of Object.keys(db[minStore])) if (d < cutoff) delete db[minStore][d];
    };
    const lk = {}, hv = {};
    for (const [id, v] of Object.entries(db.videos)) {
      if (!v.likesTrack) continue;
      if (stats[id]?.likes != null) lk[id] = stats[id].likes;
      if (stats[id]?.views != null) hv[id] = stats[id].views;
    }
    writeHourly("hourlyLikes", "hourlyLikesMin", lk);
    writeHourly("hourlyViews", "hourlyViewsMin", hv);

    // 보관 기간 정리
    const snapCutoff = localDate(new Date(Date.now() - SNAP_DAYS * 86400000));
    db.snapshots = db.snapshots.filter((s) => s.date >= snapCutoff);
    for (const d of Object.keys(db.chartDates)) if (d < snapCutoff) delete db.chartDates[d];

    writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
  }

  // 내 곡 표시용: snapshots.json 의 등록곡(마케팅 트랙 제외) ID 목록
  let ownIds = [];
  try {
    const main = JSON.parse(readFileSync(join(ROOT, "data", "snapshots.json"), "utf8"));
    ownIds = Object.entries(main.songs || {}).filter(([, s]) => !s.marketing).map(([id]) => id);
  } catch { /* 없어도 무방 */ }

  const SP_FILE = join(ROOT, "data", "spotify.json");
  const sp = existsSync(SP_FILE) ? readFileSync(SP_FILE, "utf8") : "null";
  const tpl = readFileSync(TEMPLATE, "utf8");
  writeFileSync(OUTPUT,
    tpl.replace("/*__DATA__*/ null", JSON.stringify(db))
       .replace("/*__OWN__*/ null", JSON.stringify(ownIds))
       .replace("/*__SP__*/ null", sp), "utf8");
  console.log(`[완료] 저장: data/trending.json, 페이지: trending.html`);
}

await main();
