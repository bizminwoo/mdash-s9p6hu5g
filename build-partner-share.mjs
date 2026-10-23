// 거래처 공유용 곡별 스트리밍 페이지 생성 — 2026-10-16 민우님 지시 (지분 50% 곡을 해당 거래처에 보여주기)
// data/snapshots.json(내 곡 수집 데이터)에서 지정한 곡만 뽑아 독립 페이지(<dir>/index.html)를 만든다.
// 이 페이지에는 수익·지분·광고·다른 곡·대시보드 링크를 절대 넣지 않는다. 배포는 scripts/rayvex-deploy.bat 에서 Vercel 로.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// dir 이름 = Vercel 프로젝트 이름 = 공개 주소(<dir>.vercel.app). 짐작하기 어렵게 무작위 꼬리를 붙인다.
// 곡은 ids 로 직접 지정한다 — 민우님이 말할 때만 추가(2026-10-16: 자동 추가 원치 않음). artist 지정도 지원하지만 쓰지 않는다.
const SHARES = [
  { dir: "wjh-stream-k7q2m9", title: "왕준협 음원", ids: ["blQPNauonCs"] },
  // 2026-10-23 민우님: 최한솔 쪽 8곡(천성·나찬·투엣·귀울임·상혁·용대) + 왕준협
  // from: 왕준협 9/20~9/24 광고 기간은 날짜째 빼달라 (2026-10-23 민우님)
  { dir: "chs-stream-r4t8wz", title: "음원", from: "2026-09-25",
    ids: ["blQPNauonCs", "GHrFZ1icrhg", "Cg_DLUay35I", "E7dgtMSboxg", "by6TSMwKpOs", "rlL4nsh-pz0", "a2H7UILaWmY", "4wUp5GIGHbM", "l8nG3iczo8s"] },
];

const ROOT = dirname(fileURLToPath(import.meta.url));
const DB = JSON.parse(readFileSync(join(ROOT, "data", "snapshots.json"), "utf8"));
const songs = JSON.parse(readFileSync(join(ROOT, "songs.json"), "utf8"));

const vidOf = (u) => { const m = String(u).match(/[?&]v=([\w-]{11})|youtu\.be\/([\w-]{11})/); return m ? (m[1] || m[2]) : null; };
const nf = new Intl.NumberFormat("ko-KR");
const dstr = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const nextDay = (d) => dstr(new Date(new Date(d + "T00:00:00").getTime() + 86400000));
const mdShort = (s) => { const [, m, d] = s.split("-"); return Number(m) + "/" + Number(d); };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 날짜별 0시 스냅샷 (같은 날짜가 여러 개면 가장 이른 것)
const byDate = {};
for (const s of Object.values(DB.snapshots || {})) if (!byDate[s.date] || s.time < byDate[s.date].time) byDate[s.date] = s;
const today = (DB.current?.time || dstr(new Date())).slice(0, 10);
const updated = DB.current?.time || "";

// 그날 하루 조회수 증가분 (오늘은 0시~마지막 갱신) — 대시보드와 같은 계산
const dailyOf = (id, d) => {
  const a = byDate[d]?.stats?.[id]?.views;
  if (a == null) return null;
  const b = d === today ? DB.current?.stats?.[id]?.views : byDate[nextDay(d)]?.stats?.[id]?.views;
  return b == null ? null : b - a;
};

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const HOLIDAYS = new Set(["2026-09-24", "2026-09-25", "2026-09-26", "2026-10-03", "2026-10-05", "2026-10-09", "2026-12-25", "2027-01-01"]);
const dayColor = (d) => { const w = new Date(d + "T00:00:00").getDay(); return w === 0 || HOLIDAYS.has(d) ? "#ff6b6b" : w === 6 ? "#4b9fff" : null; };

function build(share) {
  const ids = share.ids || songs.filter((s) => s.title.startsWith(share.artist + " - "))
    .sort((a, b) => String(a.release || "").localeCompare(String(b.release || ""))).map((s) => vidOf(s.url)).filter(Boolean);
  const pageTitle = share.title || (share.artist + " 음원");
  const meta = (id) => songs.find((s) => vidOf(s.url) === id) || {};
  const short = (id) => String(meta(id).title || id).replace(/^.*? - /, "");
  const multi = ids.length > 1;
  // 기록 시작일 = 곡들 중 가장 이른 스냅샷 날짜 (발매일 이전은 제외)
  const allDates = Object.keys(byDate).sort();
  const first0 = allDates.find((d) => ids.some((id) => byDate[d].stats?.[id] != null)) || today;
  // share.from: 이 날짜 전(광고 기간 등)은 그래프·표·평균에서 아예 뺀다
  const first = share.from && share.from > first0 ? share.from : first0;
  const days = [];
  for (let d = first; d <= today; d = nextDay(d)) days.push(d);
  const series = days.map((d) => {
    let v = 0, any = false;
    for (const id of ids) { const n = dailyOf(id, d); if (n != null) { v += n; any = true; } }
    return { d, v: any ? v : null, partial: d === today };
  });
  const total = ids.reduce((a, id) => a + (DB.current?.stats?.[id]?.views || 0), 0);
  const full = series.filter((x) => !x.partial && x.v != null);
  const yest = full.at(-1);
  const last7 = full.slice(-7);
  const avg7 = last7.length ? Math.round(last7.reduce((a, x) => a + x.v, 0) / last7.length) : null;
  const best = full.reduce((m, x) => (!m || x.v > m.v ? x : m), null);
  const todayV = series.at(-1)?.partial ? series.at(-1).v : null;

  // 막대 그래프 (SVG) — 한 계열, 둥근 윗모서리, 막대 사이 2px 간격, 오늘은 옅게(집계 중)
  const W = 960, H = 260, PL = 56, PR = 12, PT = 16, PB = 34;
  const maxV = Math.max(1, ...series.map((x) => x.v || 0));
  const step = (() => { const raw = maxV / 4, p = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw); })();
  const top = Math.ceil(maxV / step) * step;
  const bw = (W - PL - PR) / series.length;
  const y = (v) => PT + (H - PT - PB) * (1 - v / top);
  let svg = "";
  for (let t = 0; t <= top; t += step) svg += `<line x1="${PL}" x2="${W - PR}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${PL - 8}" y="${y(t) + 4}" class="ax" text-anchor="end">${nf.format(t)}</text>`;
  const labelEvery = Math.ceil(series.length / 12);
  series.forEach((x, i) => {
    const x0 = PL + i * bw + 1, w = Math.max(1, bw - 2);
    if (x.v != null && x.v > 0) {
      const h = Math.max(1, y(0) - y(x.v)), r = Math.min(4, w / 2, h);
      const yy = y(x.v);
      svg += `<path class="bar${x.partial ? " part" : ""}" d="M${x0},${y(0)}V${yy + r}Q${x0},${yy} ${x0 + r},${yy}H${x0 + w - r}Q${x0 + w},${yy} ${x0 + w},${yy + r}V${y(0)}Z"/>`;
    }
    svg += `<rect class="hit" x="${PL + i * bw}" y="${PT}" width="${bw}" height="${H - PT - PB}" data-d="${mdShort(x.d)}(${DOW[new Date(x.d + "T00:00:00").getDay()]})${x.partial ? " · 오늘(집계 중)" : ""}" data-v="${x.v == null ? "—" : nf.format(x.v)}"/>`;
    if (i % labelEvery === 0 || i === series.length - 1) svg += `<text x="${PL + i * bw + bw / 2}" y="${H - 12}" class="ax" text-anchor="middle">${mdShort(x.d)}</text>`;
  });
  svg += `<line x1="${PL}" x2="${W - PR}" y1="${y(0)}" y2="${y(0)}" class="base"/>`;

  // 날짜별 표 (최근이 위)
  let cum = null;
  const cumOf = (d) => ids.reduce((a, id) => a + ((d === today ? DB.current?.stats?.[id]?.views : byDate[nextDay(d)]?.stats?.[id]?.views) || 0), 0);
  const num = (v) => (v == null ? "<span class='zero'>—</span>" : nf.format(v));
  const rows = series.slice().reverse().map((x) => {
    const c = dayColor(x.d);
    cum = cumOf(x.d);
    const per = "";   // 곡별 숫자는 위 곡별 카드에서 본다 (가로로 너무 길어져서 표에서는 뺌)
    return `<tr${x.partial ? " class='today'" : ""}><td class="dt"${c ? ` style="color:${c}"` : ""}>${mdShort(x.d)} (${DOW[new Date(x.d + "T00:00:00").getDay()]})${x.partial ? " <span class='tag'>오늘</span>" : ""}</td><td><b>${num(x.v)}</b></td>${per}<td>${nf.format(cum)}</td></tr>`;
  }).join("");
  const dateHead = `<tr><th>날짜</th><th>하루 조회수${multi ? "<br>(합계)" : ""}</th><th>누적 조회수${multi ? "<br>(합계)" : ""}</th></tr>`;
  // 곡별 요약 (2곡 이상일 때)
  const songRows = ids.map((id) => {
    const ds = days.filter((d) => d < today).map((d) => dailyOf(id, d)).filter((v) => v != null);
    const y7 = ds.slice(-7);
    const m = meta(id);
    return `<tr><td class="dt"><a href="https://youtu.be/${id}" target="_blank" rel="noopener">${esc(short(id))}</a></td><td>${esc(m.release || "")}</td><td><b>${num(DB.current?.stats?.[id]?.views)}</b></td><td>${num(ds.at(-1))}</td><td>${y7.length ? nf.format(Math.round(y7.reduce((a, v) => a + v, 0) / y7.length)) : "—"}</td><td>${num(dailyOf(id, today))}</td></tr>`;
  }).join("");
  const songTable = multi ? `<div class="card" style="padding:0;overflow:hidden"><table><thead><tr><th>곡</th><th>발매일</th><th>총 조회수</th><th>어제 하루</th><th>최근 7일 평균</th><th>오늘(현재까지)</th></tr></thead><tbody>${songRows}</tbody></table></div>` : "";

  // 곡별 카드 (2026-10-23 민우님: "곡별로 보기 쉽게") — 곡마다 자기 눈금의 최근 30일 막대 + 최근 7일 숫자
  const mini = (id) => {
    const ser = days.slice(-30).map((d) => ({ d, v: dailyOf(id, d), partial: d === today }));
    const MW = 300, MH = 70, mx = Math.max(1, ...ser.map((x) => x.v || 0)), b = MW / ser.length;
    return `<svg viewBox="0 0 ${MW} ${MH}" class="mini">` + ser.map((x, i) => {
      if (!(x.v > 0)) return "";
      const h = Math.max(1, (MH - 2) * x.v / mx);
      return `<rect class="bar${x.partial ? " part" : ""}" x="${i * b + 0.5}" y="${MH - h}" width="${Math.max(1, b - 1)}" height="${h}" rx="1.5"><title>${mdShort(x.d)} ${nf.format(x.v)}회</title></rect>`;
    }).join("") + `</svg>`;
  };
  const songCards = multi ? `<div class="sgrid">` + ids.map((id) => {
    const m = meta(id);
    const ds = days.filter((d) => d < today).map((d) => ({ d, v: dailyOf(id, d) })).filter((x) => x.v != null);
    const y7 = ds.slice(-7), avg = y7.length ? Math.round(y7.reduce((a, x) => a + x.v, 0) / y7.length) : null;
    const last = ds.at(-1);
    const recent = ds.slice(-7).reverse().map((x) => `<span>${mdShort(x.d)} <b>${nf.format(x.v)}</b></span>`).join("");
    return `<div class="scard"><div class="sh"><a href="https://youtu.be/${id}" target="_blank" rel="noopener">${esc(m.title || id)}</a></div>
<div class="sr">${m.release ? esc(m.release) + " 발매 · " : ""}총 ${num(DB.current?.stats?.[id]?.views)}회</div>
<div class="sk"><div><div class="kl">어제 하루</div><div class="kv">${last ? nf.format(last.v) : "—"}</div></div><div><div class="kl">최근 7일 평균</div><div class="kv">${avg == null ? "—" : nf.format(avg)}</div></div><div><div class="kl">오늘(현재까지)</div><div class="kv">${num(dailyOf(id, today))}</div></div></div>
${mini(id)}<div class="ml">최근 30일 하루 조회수 (곡마다 눈금이 달라요)</div>
<div class="rc">${recent}</div></div>`;
  }).join("") + `</div>` : "";

  const songList = ids.map((id) => { const m = meta(id); return `<a href="https://youtu.be/${id}" target="_blank" rel="noopener">${esc(m.title || id)}</a>${m.release ? ` · ${m.release} 발매` : ""}`; }).join("<br>");
  const tile = (label, value, detail) => `<div class="tile"><div class="tl">${label}</div><div class="tv">${value}</div>${detail ? `<div class="td">${detail}</div>` : ""}</div>`;

  build.lastCount = ids.length;
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(pageTitle)} · 스트리밍 현황</title>
<style>
  :root { --bg:#0f1115; --panel:#161a22; --line:#242a36; --text:#e8ebf1; --muted:#8b93a3; --bar:#3987e5; }
  * { box-sizing:border-box; }
  body { margin:0; padding:28px 20px 60px; background:var(--bg); color:var(--text);
    font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif; }
  .page { max-width:1000px; margin:0 auto; }
  h1 { font-size:20px; margin:0 0 6px; }
  .sub { color:var(--muted); font-size:13px; margin-bottom:6px; }
  .songs { font-size:13px; color:var(--muted); margin-bottom:20px; line-height:1.7; }
  .songs a { color:var(--text); font-weight:600; text-decoration:none; }
  .tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:10px; margin-bottom:16px; }
  .tile { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:14px 16px; }
  .tl { color:var(--muted); font-size:12px; }
  .tv { font-size:24px; font-weight:700; margin-top:4px; }
  .td { color:var(--muted); font-size:11.5px; margin-top:2px; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:14px 14px 6px; margin-bottom:16px; position:relative; }
  .card h2 { font-size:14px; margin:0 0 8px; font-weight:600; }
  svg { width:100%; height:auto; display:block; }
  .grid { stroke:#232937; stroke-width:1; }
  .base { stroke:#3a4253; stroke-width:1; }
  .ax { fill:#8b93a3; font-size:11px; }
  .bar { fill:var(--bar); }
  .bar.part { fill:var(--bar); opacity:.45; }
  .hit { fill:transparent; cursor:default; }
  .hit:hover { fill:rgba(255,255,255,.05); }
  #tip { position:absolute; pointer-events:none; background:#0b0d12; border:1px solid var(--line); border-radius:8px; padding:6px 10px; font-size:12px; display:none; white-space:nowrap; }
  #tip b { font-size:14px; }
  table { width:100%; border-collapse:collapse; font-size:13.5px; }
  th,td { text-align:right; padding:8px 12px; border-bottom:1px solid var(--line); }
  th { color:var(--muted); font-weight:600; font-size:12px; }
  th:first-child, td.dt { text-align:left; }
  tr.today td { background:rgba(57,135,229,0.10); }
  .tag { font-size:10.5px; color:#8fbaf0; }
  .zero { color:#4a5162; }
  td.dt a { color:var(--text); text-decoration:none; font-weight:600; }
  th { white-space:nowrap; }
  .note { color:var(--muted); font-size:12px; margin-top:12px; line-height:1.7; }
  .sgrid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:12px; margin-bottom:16px; }
  .scard { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:14px 16px; }
  .sh a { color:var(--text); text-decoration:none; font-weight:700; font-size:14.5px; }
  .sr { color:var(--muted); font-size:12px; margin:3px 0 10px; }
  .sk { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-bottom:10px; }
  .kl { color:var(--muted); font-size:11px; }
  .kv { font-size:18px; font-weight:700; margin-top:2px; }
  .mini { width:100%; height:70px; }
  .ml { color:var(--muted); font-size:10.5px; margin:4px 0 8px; }
  .rc { display:flex; flex-wrap:wrap; gap:4px 12px; font-size:12px; color:var(--muted); }
  .rc b { color:var(--text); font-weight:600; }
  h3 { font-size:14px; margin:22px 0 10px; }
</style></head><body><div class="page">
<h1>🎵 ${esc(pageTitle)} 스트리밍 현황</h1>
<div class="sub">유튜브뮤직 기준 · 마지막 갱신 ${esc(updated)} (KST) · 매시간 자동 갱신</div>
${multi ? "" : `<div class="songs">${songList}</div>`}
<div class="tiles">
${tile("총 조회수" + (multi ? ` (${ids.length}곡 합계)` : ""), nf.format(total), "")}
${tile("어제 하루", yest ? nf.format(yest.v) : "—", yest ? mdShort(yest.d) : "")}
${tile("최근 7일 하루 평균", avg7 == null ? "—" : nf.format(avg7), last7.length ? mdShort(last7[0].d) + "~" + mdShort(last7.at(-1).d) : "")}
${tile("오늘(현재까지)", todayV == null ? "—" : nf.format(todayV), "0시~" + esc(updated.slice(11)))}
</div>
${multi ? `<h3>곡별 현황</h3>${songCards}<h3>전곡 합계</h3>` : songTable}
<div class="card"><h2>하루 조회수${multi ? " (전곡 합계)" : ""}</h2>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="날짜별 하루 조회수 막대 그래프">${svg}</svg><div id="tip"></div></div>
<div class="card" style="padding:0;overflow:hidden"><div style="overflow-x:auto"><table><thead>${dateHead}</thead><tbody>${rows}</tbody></table></div></div>
<div class="note">숫자는 유튜브 아트트랙의 하루 조회수 증가분(그날 0시 → 다음날 0시)입니다. "오늘" 칸과 그래프의 옅은 막대는 오늘 0시부터 마지막 갱신 시각까지의 수치입니다.${best ? ` 지금까지 하루 최고는 ${mdShort(best.d)} ${nf.format(best.v)}회입니다.` : ""}</div>
</div>
<script>
(() => { const tip = document.getElementById('tip'), card = tip.parentElement;
  card.querySelectorAll('.hit').forEach((r) => {
    r.addEventListener('mousemove', (e) => { const b = card.getBoundingClientRect();
      tip.innerHTML = r.dataset.d + '<br><b>' + r.dataset.v + '회</b>'; tip.style.display = 'block';
      let x = e.clientX - b.left + 12; if (x + tip.offsetWidth > b.width) x = e.clientX - b.left - tip.offsetWidth - 12;
      tip.style.left = x + 'px'; tip.style.top = (e.clientY - b.top - 10) + 'px'; });
    r.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  }); })();
</script>
</body></html>
`;
}

for (const share of SHARES) {
  const out = join(ROOT, share.dir);
  if (!existsSync(out)) mkdirSync(out);
  writeFileSync(join(out, "index.html"), build(share), "utf8");
  console.log(`[완료] ${share.dir}/index.html — ${build.lastCount}곡, 갱신 ${updated}`);
}
