// 경쟁사 아티스트 신곡 자동 감지 → competitors.json 에 추가(시간별 좋아요+조회수 상세추적 자동 등록)
// Topic 채널(아트트랙 자동 업로드)의 RSS 를 읽어 최근 며칠 내 신곡을 잡는다. 인스트루멘탈은 제외.
// collect 워크플로에서 fetch-trending.mjs 앞에 실행. 새 곡은 data/new-releases.json 에 로그로도 남긴다.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const COMP = join(ROOT, "competitors.json");
const LOG = join(ROOT, "data", "new-releases.json");
const WINDOW_DAYS = 5; // 최초 셋팅 시 과거 카탈로그 대량유입 방지 — 최근 N일 발행분만 신규 등록

// 감시 아티스트 (Topic 채널 = 아트트랙 자동업로드). 채널ID 는 각 아티스트 곡의 player API 로 확인.
const ARTISTS = [
  { name: "류민희",   channelId: "UC_NYm2crb90IKmnIQ0BUK3w" },
  { name: "도코",     channelId: "UCu90gJfilAG-rj7M5AngKaA" },
  { name: "웨이브 콜", channelId: "UC8H__2h-a0OpwINMII-pLFA" },
  { name: "오연하",   channelId: "UCWl28XjlBtHl_ucicFqLSAg" },
  { name: "서열무",   channelId: "UCNW05ubAXDiMayu8dW4v-Jg" }, // Seo Yeolmu - Topic
];

const vidOf = (u) => (u.match(/[?&]v=([\w-]{11})/) || u.match(/youtu\.be\/([\w-]{11})/) || [])[1];
const isInst = (t) => /instrumental|\(inst\.?\)/i.test(t);
const localDate = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

async function feed(cid) {
  const r = await fetch("https://www.youtube.com/feeds/videos.xml?channel_id=" + cid);
  if (!r.ok) throw new Error("RSS HTTP " + r.status);
  const t = await r.text();
  const entries = [...t.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  return entries.map((e) => ({
    id: (e.match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/) || [])[1],
    title: (e.match(/<title>([^<]+)<\/title>/) || [])[1] || "",
    published: (e.match(/<published>([^<]+)<\/published>/) || [])[1] || "",
  })).filter((v) => v.id);
}

// 유튜브 검색 (업로드 날짜순) — 제목 키워드 감지용
async function ytSearch(query) {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36";
  const res = await fetch("https://www.youtube.com/youtubei/v1/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ context: { client: { clientName: "WEB", clientVersion: "2.20260101.00.00", hl: "ko", gl: "KR" } }, query, params: "CAISAhAB" }),
  });
  if (!res.ok) throw new Error("search HTTP " + res.status);
  const d = await res.json();
  const out = [];
  (function walk(o) {
    if (!o || typeof o !== "object") return;
    if (o.videoRenderer) {
      const v = o.videoRenderer;
      const owner = (v.ownerText && v.ownerText.runs && v.ownerText.runs[0])
        || (v.longBylineText && v.longBylineText.runs && v.longBylineText.runs[0]) || {};
      out.push({ id: v.videoId, title: (v.title && v.title.runs && v.title.runs[0] && v.title.runs[0].text) || "",
        ch: owner.text || "",
        published: (v.publishedTimeText && v.publishedTimeText.simpleText) || "" });
    }
    for (const k in o) walk(o[k]);
  })(d);
  return out;
}
// 발행이 최근(~14일/2주)인지 — "3일 전"/"1주 전"/"2시간 전" 등 파싱
function recencyOK(text) {
  if (!text) return false;
  if (/개월|년/.test(text)) return false;
  const m = text.match(/(\d+)\s*(일|주)/);
  if (!m) return /시간|분|초|오늘|방금/.test(text);
  const n = parseInt(m[1], 10);
  return m[2] === "일" ? n <= 14 : n <= 2;
}

async function main() {
  const comps = JSON.parse(readFileSync(COMP, "utf8"));
  const have = new Set(
    comps.map((c) => (typeof c === "string" ? vidOf(c) : vidOf(c.url))).filter(Boolean));
  const cutoff = Date.now() - WINDOW_DAYS * 86400000;
  const added = [];

  for (const a of ARTISTS) {
    let vids;
    try { vids = await feed(a.channelId); }
    catch (e) { console.log(`  ✗ ${a.name} RSS 실패: ${e.message}`); continue; }
    for (const v of vids) {
      if (have.has(v.id) || isInst(v.title)) continue;
      const pub = Date.parse(v.published);
      if (Number.isFinite(pub) && pub < cutoff) continue; // 오래된 카탈로그 제외
      const entry = {
        url: "https://www.youtube.com/watch?v=" + v.id,
        title: `${a.name} - ${v.title}`,
        likes: true, likesTrack: true, autoAdded: true, addedAt: localDate(),
      };
      comps.push(entry);
      have.add(v.id);
      added.push({ id: v.id, title: entry.title, published: (v.published || "").slice(0, 10) });
    }
  }

  if (added.length) {
    writeFileSync(COMP, JSON.stringify(comps, null, 2) + "\n", "utf8");
    let log = [];
    if (existsSync(LOG)) { try { log = JSON.parse(readFileSync(LOG, "utf8")); } catch {} }
    log.push({ detectedAt: localDate(), items: added });
    writeFileSync(LOG, JSON.stringify(log, null, 2) + "\n", "utf8");
    console.log(`[신곡감지] ${added.length}곡 추가:`);
    for (const x of added) console.log(`  + ${x.title} (${x.published})`);
  } else {
    console.log("[신곡감지] 새 곡 없음");
  }

  // ── 우리 종이별 신곡 자동 등록 (종이별-Topic 채널 → ai-songs.json) ──
  try {
    const OWN_CHANNEL = "UCum1OD1aymgqmu8Xo7DgNNw"; // 종이별 - Topic
    const AI = join(ROOT, "ai-songs.json");
    const ai = JSON.parse(readFileSync(AI, "utf8"));
    const aiHave = new Set(ai.map((s) => (typeof s === "string" ? vidOf(s) : vidOf(s.url))).filter(Boolean));
    const vids = await feed(OWN_CHANNEL);
    const ownAdded = [];
    for (const v of vids) {
      if (aiHave.has(v.id) || isInst(v.title)) continue;
      const pub = Date.parse(v.published);
      if (Number.isFinite(pub) && pub < cutoff) continue; // 최근 발행분만
      ai.push({ url: "https://www.youtube.com/watch?v=" + v.id, title: "종이별 - " + v.title, share: 1 });
      aiHave.add(v.id);
      ownAdded.push("종이별 - " + v.title);
    }
    if (ownAdded.length) {
      writeFileSync(AI, JSON.stringify(ai, null, 2) + "\n", "utf8");
      console.log(`[종이별 신곡] ${ownAdded.length}곡 ai.html 등록: ` + ownAdded.join(", "));
    } else {
      console.log("[종이별 신곡] 새 곡 없음");
    }
  } catch (e) { console.log("[종이별 신곡] 실패:", String(e.message).split("\n")[0]); }

  // ── 로코베리 키워드 감지 — 자동 등록하지 않고 "후보"만 출력 (2026-08-19 민우님 지시: 발견되면 물어보고, 등록은 직접 준 링크로만)
  try {
    const KEYWORD = "로코베리";
    const results = await ytSearch(KEYWORD);
    const c2 = JSON.parse(readFileSync(COMP, "utf8"));
    const have2 = new Set(c2.map((c) => (typeof c === "string" ? vidOf(c) : vidOf(c.url))).filter(Boolean));
    const CAND = join(ROOT, "data", "rocoberry-candidates.json");
    let seenCand = [];
    if (existsSync(CAND)) { try { seenCand = JSON.parse(readFileSync(CAND, "utf8")); } catch {} }
    const seenIds = new Set(seenCand.map((x) => x.id));
    const found = [];
    for (const v of results) {
      if (!v.id || have2.has(v.id) || seenIds.has(v.id) || isInst(v.title)) continue;
      if (!v.title.includes(KEYWORD)) continue;   // 제목(또는 prod.)에 로코베리 포함
      if (!recencyOK(v.published)) continue;       // 최근 발행분만
      if (!/(-\s*topic|토픽)\s*$/i.test((v.ch || "").trim())) continue; // 아트트랙(Topic 채널)만 — 플레이리스트/믹스 제외
      found.push({ id: v.id, title: v.title.slice(0, 80), foundAt: localDate() });
      seenIds.add(v.id);
    }
    if (found.length) {
      writeFileSync(CAND, JSON.stringify([...seenCand, ...found], null, 2) + "\n", "utf8");
      console.log(`[로코베리 후보] ${found.length}곡 발견 — 자동등록 안 함, 민우님 확인 필요:`);
      for (const x of found) console.log(`  ? ${x.title} https://www.youtube.com/watch?v=${x.id}`);
    } else { console.log("[로코베리] 새 곡 없음"); }
  } catch (e) { console.log("[로코베리] 실패:", String(e.message).split("\n")[0]); }
}

await main();
