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
        likes: true, autoAdded: true, addedAt: localDate(),
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
}

await main();
