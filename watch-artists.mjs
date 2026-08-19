// 아티스트 신곡 감시 — 유튜브 RSS 기반 (스크래핑 아님, 안정적)
// 사용: node watch-artists.mjs        → 새 곡 있으면 JSON 리포트 출력
//       node watch-artists.mjs seed   → 현재 목록을 기준선으로 저장(리포트 없음)
// 상태 파일: C:\Users\이민우\Downloads\memory\artist-watch-state.json
// 정책 (2026-08-19 민우님 확정):
//  - Topic 채널(도코·웨이브콜·류민희) 새 트랙 = 아트트랙 → autoRegister (Instrumental/Inst. 제외)
//  - 서열무(본인 채널) 새 영상 → askUser (MV/앨범 구분 필요해서 확인 후 등록)
//  - 로코베리 = 감시 제외 (prod. 곡은 민우님이 직접 링크 줌)
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const STATE = "C:\\Users\\이민우\\Downloads\\memory\\artist-watch-state.json";
const ARTISTS = [
  { name: "도코",     channelId: "UCu90gJfilAG-rj7M5AngKaA", mode: "autoRegister" },
  { name: "웨이브 콜", channelId: "UC8H__2h-a0OpwINMII-pLFA", mode: "autoRegister" },
  { name: "류민희",   channelId: "UC_NYm2crb90IKmnIQ0BUK3w", mode: "autoRegister" },
  { name: "서열무",   channelId: "UCy_XZr-U6z0aLvTPKbpH3ig", mode: "askUser" },
];
const INST = /instrumental|\binst\b|inst\./i;

async function fetchFeed(channelId) {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
  const xml = await res.text();
  const items = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const id = (e.match(/<yt:videoId>([^<]+)</) || [])[1];
    const title = (e.match(/<title>([^<]*)</) || [])[1];
    const published = (e.match(/<published>([^<]+)</) || [])[1];
    if (id) items.push({ id, title, published });
  }
  return items;
}

const seedMode = process.argv[2] === "seed";
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { known: {}, lastRun: null };
state.known = state.known || {};

const report = { newSongs: [], errors: [] };
for (const a of ARTISTS) {
  try {
    const items = await fetchFeed(a.channelId);
    const seen = new Set(state.known[a.channelId] || []);
    for (const it of items) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      if (!seedMode) {
        const isInst = INST.test(it.title);
        report.newSongs.push({
          artist: a.name, mode: isInst ? "ignore" : a.mode,
          videoId: it.id, title: it.title, published: it.published,
          url: `https://www.youtube.com/watch?v=${it.id}`,
        });
      }
    }
    state.known[a.channelId] = [...seen];
  } catch (err) {
    report.errors.push({ artist: a.name, error: String(err.message || err) });
  }
}
state.lastRun = new Date().toISOString();
writeFileSync(STATE, JSON.stringify(state, null, 2), "utf8");

if (seedMode) {
  console.log(JSON.stringify({ seeded: true, channels: ARTISTS.map(a => a.name), counts: Object.fromEntries(ARTISTS.map(a => [a.name, (state.known[a.channelId] || []).length])) }, null, 2));
} else {
  console.log(JSON.stringify(report, null, 2));
}
