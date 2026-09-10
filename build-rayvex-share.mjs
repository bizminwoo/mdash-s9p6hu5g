// 레이벡스 음원(공유용) 페이지 생성 — 2026-09-10 민우님 지시
// data/trending.json 의 group:"test"(-레이벡스 음원-) 곡만 뽑아,
// 외부 공유 가능한 독립 페이지(share-rayvex/index.html)를 만든다.
// 이 페이지에는 수익·지분·다른 곡·대시보드 링크를 절대 넣지 않는다.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DB = JSON.parse(readFileSync(join(ROOT, "data", "trending.json"), "utf8"));
const comps = JSON.parse(readFileSync(join(ROOT, "competitors.json"), "utf8"));

const vidOf = (u) => { const m = String(u).match(/[?&]v=([\w-]{11})|youtu\.be\/([\w-]{11})/); return m ? (m[1] || m[2]) : null; };
const nf = new Intl.NumberFormat("ko-KR");
const fmt = (n) => (n == null ? "<span class='zero'>—</span>" : nf.format(n));
const dstr = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

// -레이벡스 음원- 곡: competitors.json 의 group:"test" 순서 그대로
const ids = comps.filter((e) => e.group === "test").map((e) => vidOf(e.url)).filter(Boolean);

const byDate = Object.fromEntries((DB.snapshots || []).map((s) => [s.date, s]));
const today = (DB.current?.time || dstr(new Date())).slice(0, 10);
const nextDay = (d) => dstr(new Date(new Date(d + "T00:00:00").getTime() + 86400000));
const days = [];
{ const base = new Date(today + "T00:00:00");
  for (let i = 13; i >= 0; i--) days.push(dstr(new Date(base.getTime() - i * 86400000))); }

// 그날 하루 스트리밍 (오늘은 현재까지) — 대시보드와 같은 계산
const dailyOf = (id, d) => {
  const a = byDate[d]?.stats?.[id]?.views;
  if (a == null) return null;
  const b = d === today ? DB.current?.stats?.[id]?.views : byDate[nextDay(d)]?.stats?.[id]?.views;
  return b == null ? null : b - a;
};

const head = "<tr><th class='song'>곡</th>" +
  days.map((d) => "<th>" + d.slice(5).replace("-", "/") + (d === today ? "<br>오늘(현재)" : "") + "</th>").join("") +
  "<th>총 조회수</th></tr>";

const rows = ids.map((id) => {
  const v = DB.videos[id] || {};
  const cells = days.map((d) => {
    const n = dailyOf(id, d);
    return "<td class='" + (d === today ? "today" : "") + "'>" + fmt(n) + "</td>";
  }).join("");
  const total = DB.current?.stats?.[id]?.views;
  return "<tr><td class='song'><a href='https://youtu.be/" + id + "' target='_blank'>" + (v.title || id) + "</a>" +
    "<span class='artist'>" + (v.artist || "") + (v.release ? " · " + v.release + " 발매" : "") + "</span></td>" +
    cells + "<td><b>" + fmt(total) + "</b></td></tr>";
}).join("");

const updated = DB.current?.time || "";
const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>레이벡스 음원 스트리밍 현황</title>
<style>
  :root { --bg:#0f1115; --panel:#161a22; --line:#242a36; --text:#e8ebf1; --muted:#8b93a3; }
  * { box-sizing:border-box; }
  body { margin:0; padding:28px 20px 60px; background:var(--bg); color:var(--text);
    font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif; }
  h1 { font-size:20px; margin:0 0 6px; }
  .sub { color:var(--muted); font-size:13px; margin-bottom:20px; }
  .wrap { overflow-x:auto; border:1px solid var(--line); border-radius:12px; background:var(--panel); }
  table { width:100%; border-collapse:collapse; font-size:13.5px; white-space:nowrap; }
  th,td { text-align:right; padding:9px 14px; border-bottom:1px solid var(--line); }
  tr:last-child td { border-bottom:none; }
  th { color:var(--muted); font-weight:600; font-size:12px; }
  th.song,td.song { text-align:left; position:sticky; left:0; background:var(--panel); }
  td.song a { color:var(--text); text-decoration:none; font-weight:600; }
  td.song a:hover { text-decoration:underline; }
  .artist { display:block; color:var(--muted); font-size:11.5px; margin-top:2px; }
  td.today { background:rgba(57,135,229,0.10); }
  .zero { color:#4a5162; }
  .note { color:var(--muted); font-size:12px; margin-top:14px; line-height:1.6; }
</style></head><body>
<h1>🎵 레이벡스 음원 스트리밍 현황</h1>
<div class="sub">유튜브뮤직 기준 · 마지막 갱신 ${updated} (KST) · 매시간 자동 갱신</div>
<div class="wrap"><table><thead>${head}</thead><tbody>${rows}</tbody></table></div>
<div class="note">숫자는 각 곡 유튜브 아트트랙의 일별 조회수 증가분입니다. "오늘(현재)" 칸은 오늘 0시부터 마지막 갱신 시각까지의 수치입니다.</div>
</body></html>
`;

const OUT_DIR = join(ROOT, "share-rayvex");
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR);
writeFileSync(join(OUT_DIR, "index.html"), html, "utf8");
console.log(`[완료] share-rayvex/index.html — ${ids.length}곡, 갱신 ${updated}`);
