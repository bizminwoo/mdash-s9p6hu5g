// 미팅용 사례 페이지 — 2026-10-27 민우님: "데일리 스밍이 낮은 곡을 인접권 구매해서 내가 마케팅해서 이렇게 올랐다"를 보여주기.
// 카디코기 인접권 인수곡 11곡만(신곡 「바보야」는 인수곡이 아니라 제외). 아티스트·곡명은 가명으로만 표기, 유튜브 링크·발매일·수익·지분 절대 넣지 않음.
// 광고 집행일(adFrom~adTo)의 조회수는 유료 노출이 섞이므로 그 곡의 그날 증가분을 통째로 뺀다 (가장 보수적인 계산).
// 인수 전 = 발매일~첫 기록일 누적 조회수 ÷ 일수 (평생 평균 — 직전 실제 속도보다 높게 잡혀서 성과를 작게 보이는 보수적 기준).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = "case-a-p3x8v2";
const ACQ = "2026-09-01";   // 인접권 정리(8/31) 다음 날 = 마케팅 시작
const END = "2026-10-21";   // 2026-10-27 민우님: "가파르게 떨어지는 건 빼고 10/21까지만" — 이 날짜까지만 보여준다
// 가명: 원래 곡 → 표시 이름 (순서 = 카드 순서)
const ALIAS = [
  ["-rFw4j4aqg0", "Track A"], ["GAYhdUa2-q4", "Track B"], ["HC61q5FWciY", "Track C"], ["xZKpKdsJO2k", "Track D"],
  ["FwQg1oq0ZwY", "Track E"], ["crsPCJTNIgE", "Track F"],
  // 2026-10-27 민우님 "트랙G도 그냥 빼자": 아슬아슬 (deluxe ver.) 제외
  // 2026-10-27 민우님 "안 오른 4곡은 빼": 강아지풀·Suicide·Needy(Solo)·Walking on Frozen 제외
];
const ARTIST = "아티스트 K";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DB = JSON.parse(readFileSync(join(ROOT, "data", "snapshots.json"), "utf8"));
const songs = JSON.parse(readFileSync(join(ROOT, "songs.json"), "utf8"));
const vidOf = (u) => { const m = String(u).match(/[?&]v=([\w-]{11})|youtu\.be\/([\w-]{11})/); return m ? (m[1] || m[2]) : null; };
const meta = (id) => songs.find((s) => vidOf(s.url) === id) || {};
const nf = new Intl.NumberFormat("ko-KR");
const dstr = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const nextDay = (d) => dstr(new Date(new Date(d + "T00:00:00").getTime() + 86400000));
const addDays = (d, n) => dstr(new Date(new Date(d + "T00:00:00").getTime() + n * 86400000));
const md = (s) => { const [, m, d] = s.split("-"); return Number(m) + "/" + Number(d); };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const mult = (a, b) => (b > 0 ? (a / b >= 10 ? Math.round(a / b) : Math.round(a / b * 10) / 10) : null);

const byDate = {};
for (const s of Object.values(DB.snapshots || {})) if (!byDate[s.date] || s.time < byDate[s.date].time) byDate[s.date] = s;
const today = (DB.current?.time || dstr(new Date())).slice(0, 10);
const updated = DB.current?.time || "";
const isAd = (id, d) => { const g = meta(id); return g.adFrom && d >= g.adFrom && (!g.adTo || d <= g.adTo); };
// 하루 증가분 (어제까지만, 광고일은 null)
const daily = (id, d) => {
  if (d >= today || d > END || isAd(id, d)) return null;
  const a = byDate[d]?.stats?.[id]?.views, b = byDate[nextDay(d)]?.stats?.[id]?.views;
  return a == null || b == null ? null : Math.max(0, b - a);
};
const ids = ALIAS.map(([id]) => id);
const name = Object.fromEntries(ALIAS);
const allDates = Object.keys(byDate).sort();
const firstOf = (id) => allDates.find((d) => byDate[d].stats?.[id]?.views != null);
// 인수 전 하루 평균 (발매~첫 기록)
const before = (id) => {
  const f = firstOf(id), v = byDate[f].stats[id].views, rel = meta(id).release;
  return { v: v / Math.max(1, (Date.parse(f) - Date.parse(rel)) / 864e5), atAcq: v, f };
};
const avgOver = (id, from, to) => {
  let s = 0, n = 0;
  for (let d = from; d <= to; d = nextDay(d)) { const v = daily(id, d); if (v != null) { s += v; n++; } }
  return n ? s / n : null;
};
const yest = END < today ? END : addDays(today, -1);
const r30 = addDays(yest, -29), r7 = addDays(yest, -6);

// 기간별 전곡 하루 평균 (광고일·빈 날 제외 → 곡마다 평균 낸 뒤 더함)
const sumAvg = (from, to) => ids.reduce((a, id) => a + (avgOver(id, from, to) || 0), 0);
const beforeTotal = ids.reduce((a, id) => a + before(id).v, 0);
const periods = [
  { l: "인수 전", sub: "발매~인수 평균", v: beforeTotal, pre: true },
  { l: "9월", sub: "인수 첫 달", v: sumAvg("2026-09-01", "2026-09-30") },
  { l: "10월", sub: `10/1~${md(yest)}`, v: sumAvg("2026-10-01", yest) },
  { l: "마지막 7일", sub: `${md(r7)}~${md(yest)}`, v: sumAvg(r7, yest) },
];
const recent30 = sumAvg(r30, yest);
const atAcqTotal = ids.reduce((a, id) => a + before(id).atAcq, 0);
// 인수 후 늘어난 실제 조회수 (광고일 제외) 합
const gained = ids.reduce((a, id) => { let s = 0; for (let d = firstOf(id); d < today; d = nextDay(d)) s += daily(id, d) || 0; return a + s; }, 0);

// ── 기간 비교 막대 (가로)
const PW = 960, rowH = 46, PH = periods.length * rowH + 10, LBL = 150;
const pmax = Math.max(...periods.map((p) => p.v));
let psvg = "";
periods.forEach((p, i) => {
  const y = 6 + i * rowH, w = Math.max(3, (PW - LBL - 170) * p.v / pmax);
  psvg += `<text x="0" y="${y + 18}" class="pl">${p.l}</text><text x="0" y="${y + 34}" class="ax">${esc(p.sub)}</text>`;
  psvg += `<rect x="${LBL}" y="${y + 6}" width="${w}" height="26" rx="5" class="${p.pre ? "pre" : "bar"}"/>`;
  psvg += `<text x="${LBL + w + 10}" y="${y + 25}" class="pv">${nf.format(Math.round(p.v))}회/일${p.pre ? "" : ` <tspan class="px">· ${mult(p.v, beforeTotal)}배</tspan>`}</text>`;
});

// ── 일별 막대 (전곡 합계, 광고일은 그 곡만 빠짐)
const days = []; for (let d = allDates.find((d) => ids.some((id) => byDate[d].stats?.[id])); d < today && d <= END; d = nextDay(d)) days.push(d);
const series = days.map((d) => { let v = 0, any = false; for (const id of ids) { const n = daily(id, d); if (n != null) { v += n; any = true; } } return { d, v: any ? v : null }; });
const W = 960, H = 280, PL = 56, PR = 12, PT = 22, PB = 34;
const maxV = Math.max(1, ...series.map((x) => x.v || 0));
const step = (() => { const raw = maxV / 4, p = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw); })();
const top = Math.ceil(maxV / step) * step, bw = (W - PL - PR) / series.length, y = (v) => PT + (H - PT - PB) * (1 - v / top);
let svg = "";
for (let t = 0; t <= top; t += step) svg += `<line x1="${PL}" x2="${W - PR}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${PL - 8}" y="${y(t) + 4}" class="ax" text-anchor="end">${nf.format(t)}</text>`;
const labelEvery = Math.ceil(series.length / 12);
series.forEach((x, i) => {
  const x0 = PL + i * bw + 1, w = Math.max(1, bw - 2);
  if (x.v > 0) { const yy = y(x.v), h = y(0) - yy, r = Math.min(3, w / 2, h);
    svg += `<path class="${x.d < ACQ ? "pre" : "bar"}" d="M${x0},${y(0)}V${yy + r}Q${x0},${yy} ${x0 + r},${yy}H${x0 + w - r}Q${x0 + w},${yy} ${x0 + w},${yy + r}V${y(0)}Z"/>`; }
  svg += `<rect class="hit" x="${PL + i * bw}" y="${PT}" width="${bw}" height="${H - PT - PB}" data-d="${md(x.d)}" data-v="${x.v == null ? "기록 없음" : nf.format(x.v) + "회"}"/>`;
  if (i % labelEvery === 0) svg += `<text x="${PL + i * bw + bw / 2}" y="${H - 12}" class="ax" text-anchor="middle">${md(x.d)}</text>`;
  if (x.d === ACQ) svg += `<line x1="${PL + i * bw}" x2="${PL + i * bw}" y1="${PT - 8}" y2="${y(0)}" class="mk"/><text x="${PL + i * bw + 5}" y="${PT - 10}" class="mkt">인수·마케팅 시작</text>`;
});
svg += `<line x1="${PL}" x2="${W - PR}" y1="${y(0)}" y2="${y(0)}" class="base"/>`;

// ── 곡별 카드
const cards = ALIAS.map(([id, nm]) => ({ id, nm, b: before(id).v, a: avgOver(id, r30, yest) || 0 }))
  .sort((p, q) => q.a - p.a).map(({ id, nm, b, a }) => {
    const ser = days.map((d) => ({ d, v: daily(id, d) }));
    const MW = 300, MH = 70, mx = Math.max(1, b, ...ser.map((x) => x.v || 0)), bb = MW / ser.length;
    const ix = ser.findIndex((x) => x.d >= ACQ);
    let m = `<svg viewBox="0 0 ${MW} ${MH + 2}" class="mini">`;
    ser.forEach((x, i) => { if (x.v > 0) { const h = Math.max(1, MH * x.v / mx); m += `<rect class="bar" x="${i * bb + 0.5}" y="${MH - h}" width="${Math.max(1, bb - 1)}" height="${h}" rx="1"><title>${md(x.d)} ${nf.format(x.v)}회</title></rect>`; } });
    const by = MH - Math.max(1, MH * b / mx);
    m += `<line x1="0" x2="${MW}" y1="${by}" y2="${by}" class="bl"/>`;
    if (ix > 0) m += `<line x1="${ix * bb}" x2="${ix * bb}" y1="0" y2="${MH}" class="mk"/>`;
    m += `</svg>`;
    const x = mult(a, b);
    return `<div class="scard"><div class="sh">${esc(nm)} <span class="ar">${esc(ARTIST)}</span></div>
<div class="sk"><div><div class="kl">인수 전 하루</div><div class="kv dim">${nf.format(Math.round(b))}</div></div><div><div class="kl">${md(r30)}~${md(yest)} 하루</div><div class="kv">${nf.format(Math.round(a))}</div></div><div><div class="kl">변화</div><div class="kv up">${x == null ? "—" : x + "배"}</div></div></div>
${m}<div class="ml">하루 조회수 · 점선 = 인수 전 평균 · 세로선 = 인수 시점</div></div>`;
  }).join("");

// ── 수익으로 보면 (2026-10-27 민우님: "원래 인접권이 얼마 나왔는데, 이제는 저작권만으로 그보다 훨씬 많이 번다")
// 인접권 단가 = 내 대시보드 다날 기본 단가(스트림당 6.0원). 저작권 단가는 확인된 값이 들어오기 전엔 비워 둔다(추측 금지).
// 2026-10-27 민우님 "실연권+저작권은 아티스트한테 가니까 그걸로" → 국내 음원 전송사용료 징수규정 비율(제작 48.25 : 저작 10.5 : 실연 6.25)로 환산.
//   유튜브뮤직은 이 규정을 그대로 따르지 않으므로 페이지에 "추정"으로 표기한다.
const RATE_NB = 6.0, RATE_CP = RATE_NB * (10.5 + 6.25) / 48.25;
const tile = (l, v, d, cls = "") => `<div class="tile"><div class="tl">${l}</div><div class="tv ${cls}">${v}</div>${d ? `<div class="td">${d}</div>` : ""}</div>`;
const man = (won) => (won >= 1e8 ? (Math.round(won / 1e7) / 10) + "억 원" : won >= 10000 ? nf.format(Math.round(won / 10000)) + "만 원" : nf.format(Math.round(won / 1000) * 1000) + "원");
const monBefore = beforeTotal * 30, monAfter = recent30 * 30;
const moneyRows = [
  ["인수 전 · 인접권", man(monBefore * RATE_NB), `하루 ${nf.format(Math.round(beforeTotal))}회 기준`, "pre"],
  ...(RATE_CP ? [["인수 후 · 실연권+저작권", man(monAfter * RATE_CP), `하루 ${nf.format(Math.round(recent30))}회 기준 · 아티스트 몫`, "cp"]] : []),
  // 2026-10-27 민우님 "인접권 수익은 빼, 인접권은 내가 가지고 있는 거니까" — 인수 후 인접권 수입은 보여주지 않는다
];
const mmax = Math.max(...moneyRows.map((r) => parseFloat(r[1].replace(/[^\d.]/g, "")) * (r[1].includes("만") ? 10000 : 1)));
const wonOf = (s) => parseFloat(s.replace(/[^\d.]/g, "")) * (s.includes("만") ? 10000 : 1);
let msvg = ""; const MH2 = moneyRows.length * 52 + 8;
moneyRows.forEach(([l, v, sub, cls], i) => {
  const y0 = 6 + i * 52, w = Math.max(3, (PW - 190 - 150) * wonOf(v) / mmax);
  msvg += `<text x="0" y="${y0 + 18}" class="pl">${l}</text><text x="0" y="${y0 + 35}" class="ax">${esc(sub)}</text>`;
  msvg += `<rect x="190" y="${y0 + 8}" width="${w}" height="28" rx="5" class="${cls}"/><text x="${190 + w + 10}" y="${y0 + 28}" class="pv">월 ${v}</text>`;
});
const moneyCard = `<h3>💰 수익으로 보면 (한 달 기준)</h3>
<div class="tiles">
${tile("인수 전 인접권 수입", "월 " + man(monBefore * RATE_NB), "인수 전 하루 평균 × 30일")}
${RATE_CP ? tile("지금 실연권+저작권 (아티스트 몫)", "월 " + man(monAfter * RATE_CP), `${md(r30)}~${md(yest)} 하루 평균 × 30일 · 인수 전 인접권의 ${Math.round(monAfter * RATE_CP / (monBefore * RATE_NB))}배`, "up") : ""}
${tile("인수 전 한 달 스트리밍", nf.format(Math.round(monBefore)) + "회", "인수 전 하루 평균 × 30일")}
${tile("지금 한 달 스트리밍", nf.format(Math.round(monAfter)) + "회", `${md(r30)}~${md(yest)} 하루 평균 × 30일`, "up")}
</div>
${RATE_CP ? `<div class="card"><h2>한 달 수입 비교</h2><svg viewBox="0 0 ${PW} ${MH2}">${msvg}</svg></div>` : ""}`;

const page = (v) => `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${v.title}</title>
<style>
  :root { --bg:#0f1115; --panel:#161a22; --line:#242a36; --text:#e8ebf1; --muted:#8b93a3; --bar:#3987e5; --pre:#5b6375; --up:#3ccf8e; }
  * { box-sizing:border-box; }
  body { margin:0; padding:28px 20px 60px; background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif; }
  .page { max-width:1000px; margin:0 auto; }
  h1 { font-size:21px; margin:0 0 6px; }
  .sub { color:var(--muted); font-size:13px; margin-bottom:18px; line-height:1.6; }
  .tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:10px; margin-bottom:16px; }
  .tile { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:14px 16px; }
  .tl { color:var(--muted); font-size:12px; } .tv { font-size:26px; font-weight:700; margin-top:4px; } .td { color:var(--muted); font-size:11.5px; margin-top:3px; }
  .tv.up, .kv.up { color:var(--up); } .kv.dim { color:var(--muted); }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:14px 14px 8px; margin-bottom:16px; position:relative; }
  .card h2 { font-size:14px; margin:0 0 10px; font-weight:600; }
  svg { width:100%; height:auto; display:block; }
  .grid { stroke:#232937; } .base { stroke:#3a4253; } .ax { fill:#8b93a3; font-size:11px; }
  .bar { fill:var(--bar); } .pre { fill:var(--pre); } .cp { fill:var(--up); } .hit { fill:transparent; } .hit:hover { fill:rgba(255,255,255,.05); }
  .mk { stroke:#e8b84a; stroke-width:1.5; stroke-dasharray:4 3; } .mkt { fill:#e8b84a; font-size:11.5px; font-weight:600; }
  .bl { stroke:#c9ced8; stroke-width:1.2; stroke-dasharray:3 3; }
  .pl { fill:var(--text); font-size:14px; font-weight:600; } .pv { fill:var(--text); font-size:14px; font-weight:700; } .px { fill:var(--up); }
  #tip { position:absolute; pointer-events:none; background:#0b0d12; border:1px solid var(--line); border-radius:8px; padding:6px 10px; font-size:12px; display:none; white-space:nowrap; }
  h3 { font-size:15px; margin:24px 0 10px; }
  .sgrid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:12px; margin-bottom:16px; }
  .scard { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:14px 16px; }
  .sh { font-weight:700; font-size:15px; margin-bottom:10px; } .ar { color:var(--muted); font-weight:500; font-size:12px; margin-left:4px; }
  .sk { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-bottom:10px; }
  .kl { color:var(--muted); font-size:11px; } .kv { font-size:18px; font-weight:700; margin-top:2px; }
  .mini { width:100%; height:72px; } .ml { color:var(--muted); font-size:10.5px; margin-top:4px; }
  .note { color:var(--muted); font-size:12px; margin-top:14px; line-height:1.8; }
</style></head><body><div class="page">
<h1>${v.h1}</h1>
<div class="sub">${esc(ARTIST)} 기존 발매곡 ${ids.length}곡 · 발매 후 하루 스트리밍이 낮던 곡의 인접권을 인수해 직접 마케팅<br>유튜브뮤직 기준 · 인수(${md(ACQ)})부터 ${md(yest)}까지 · 아티스트·곡명은 가명</div>
${v.intro}
<div class="tiles">
${tile("인수 전 하루 평균 (전곡)", nf.format(Math.round(beforeTotal)) + "회", "발매~인수 기간 평균")}
${tile(`${md(r30)}~${md(yest)} 하루 평균 (전곡)`, nf.format(Math.round(recent30)) + "회", `${md(r30)}~${md(yest)}`)}
${tile("변화", mult(recent30, beforeTotal) + "배", `인수 전 대비 ${md(r30)}~${md(yest)}`, "up")}
${tile("인수 후 늘어난 조회수", "+" + nf.format(gained) + "회", `${md(yest)}까지 · 인수 시점 누적 ${nf.format(atAcqTotal)}회`)}
</div>
<div class="card"><h2>기간별 하루 평균 조회수 (전곡 합계)</h2><svg viewBox="0 0 ${PW} ${PH}">${psvg}</svg></div>
<div class="card"><h2>날짜별 하루 조회수 (전곡 합계)</h2><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="날짜별 하루 조회수">${svg}</svg><div id="tip"></div></div>
<h3>곡별 변화 (${md(r30)}~${md(yest)} 하루 평균이 높은 순)</h3>
<div class="sgrid">${cards}</div>
${v.money}
<div class="note">· 하루 조회수 = 유튜브 아트트랙 조회수의 하루 증가분(그날 0시 → 다음날 0시).<br>
· 인수 전 평균 = 발매일부터 인수 시점까지의 누적 조회수 ÷ 일수. 인수 직전 실제 하루 조회수는 이보다 더 낮았습니다(인수 직전 하루 측정값: 전곡 ${nf.format(byDate["2026-08-28"] && byDate["2026-08-29"] ? ids.reduce((a, id) => a + ((byDate["2026-08-29"].stats[id]?.views ?? 0) - (byDate["2026-08-28"].stats[id]?.views ?? byDate["2026-08-29"].stats[id]?.views ?? 0)), 0) : 0)}회).<br>
· 날짜별 그래프에서 막대가 없는 날은 집계 기록이 빠진 날입니다.<br>
${v.moneyNote}</div>
</div>
<script>
(() => { const tip = document.getElementById('tip'), card = tip.parentElement;
  card.querySelectorAll('.hit').forEach((r) => {
    r.addEventListener('mousemove', (e) => { const b = card.getBoundingClientRect();
      tip.innerHTML = r.dataset.d + '<br><b>' + r.dataset.v + '</b>'; tip.style.display = 'block';
      let x = e.clientX - b.left + 12; if (x + tip.offsetWidth > b.width) x = e.clientX - b.left - tip.offsetWidth - 12;
      tip.style.left = x + 'px'; tip.style.top = (e.clientY - b.top - 10) + 'px'; });
    r.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  }); })();
</script>
</body></html>
`;
// ── 두 가지 버전 (2026-10-27 민우님: "유통사 대상 PR 자료 / 아티스트한테 인접권 팔고 저작권+실연권+인지도 얻어라")
const cumNow = atAcqTotal + gained;
// ── 인수 후 추가 발매 (2026-10-27 민우님: "핵심은 인접권 구매 후 계속 추가 발매 — 바보야 사례 넣어줘")
//   같은 아티스트 신곡. 광고일(adFrom~adTo)은 위와 똑같이 빼고, 광고 끝난 뒤 ~END 까지만 센다.
const NEW_ID = "lBfysK-tSrU", NEW_NAME = "신곡 Track N";
const FEE = 0.2;   // 유통 수수료 가정 20% (민우님 "대충 20%")
const ART_NB = 0.3;   // 신곡 인접권 아티스트 몫 30% (민우님 "내가 7 너가 3")
const newRel = meta(NEW_ID).release;
const newSer = []; for (let d = newRel; d <= yest; d = nextDay(d)) newSer.push({ d, v: daily(NEW_ID, d), ad: isAd(NEW_ID, d) });
// 2026-10-27 민우님 "하루 조회수에서 광고라는 부분 다 빼줘" — 페이지에 광고 표시·문구를 안 쓰고, 신곡 그래프는 광고 끝난 날부터 그린다
while (newSer.length && newSer[0].v == null) newSer.shift();
const newOrg = newSer.filter((x) => x.v != null);
const newAvg = newOrg.length ? newOrg.reduce((a, x) => a + x.v, 0) / newOrg.length : 0;
const newSum = newOrg.reduce((a, x) => a + x.v, 0);
const newChart = (() => {
  const NW = 960, NH = 200, L = 56, Rr = 12, T = 16, B = 30, mx = Math.max(1, ...newSer.map((x) => x.v || 0));
  const st = (() => { const raw = mx / 4, p = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw); })();
  const tp = Math.ceil(mx / st) * st, bw2 = (NW - L - Rr) / newSer.length, yy = (v) => T + (NH - T - B) * (1 - v / tp);
  let s = "";
  for (let t = 0; t <= tp; t += st) s += `<line x1="${L}" x2="${NW - Rr}" y1="${yy(t)}" y2="${yy(t)}" class="grid"/><text x="${L - 8}" y="${yy(t) + 4}" class="ax" text-anchor="end">${nf.format(t)}</text>`;
  newSer.forEach((x, i) => {
    const x0 = L + i * bw2 + 2, w = Math.max(1, bw2 - 4);
    if (x.ad) s += `<rect x="${x0}" y="${T}" width="${w}" height="${yy(0) - T}" rx="4" class="adz"/><text x="${x0 + w / 2}" y="${yy(0) - 8}" class="ax" text-anchor="middle">광고</text>`;
    else if (x.v > 0) s += `<rect x="${x0}" y="${yy(x.v)}" width="${w}" height="${yy(0) - yy(x.v)}" rx="4" class="cp"><title>${md(x.d)} ${nf.format(x.v)}회</title></rect><text x="${x0 + w / 2}" y="${yy(x.v) - 5}" class="ax" text-anchor="middle">${nf.format(Math.round(x.v / 1000))}천</text>`;
    s += `<text x="${x0 + w / 2}" y="${NH - 10}" class="ax" text-anchor="middle">${md(x.d)}</text>`;
  });
  return `<svg viewBox="0 0 ${NW} ${NH}">${s}<line x1="${L}" x2="${NW - Rr}" y1="${yy(0)}" y2="${yy(0)}" class="base"/></svg>`;
})();
const newHead = `<h3>➕ 인수 후 추가 발매 — 같은 아티스트 신곡</h3>`;
const newNote = `<div class="ml" style="margin:4px 0 0">하루 조회수 · ${md(newRel)} 발매</div>`;
const newArtist = `${newHead}
<div class="tiles">
${tile(NEW_NAME + " 하루 평균", nf.format(Math.round(newAvg)) + "회", `${md(newOrg[0]?.d || yest)}~${md(yest)}`, "up")}
${tile("쌓인 조회수", nf.format(newSum) + "회", `${md(newOrg[0]?.d || yest)}~${md(yest)}`)}
</div>
<div class="tiles">
${tile("신곡 실연권+저작권", "월 " + man(newAvg * 30 * RATE_CP), "아티스트 몫 · 하루 평균 × 30일")}
${tile(`신곡 인접권 ${ART_NB * 100}%`, "월 " + man(newAvg * 30 * RATE_NB * ART_NB), `신곡 인접권은 저희 ${(1 - ART_NB) * 10} : 아티스트 ${ART_NB * 10}`)}
${tile("신곡 1곡으로 아티스트가 받는 돈", "월 " + man(newAvg * 30 * (RATE_CP + RATE_NB * ART_NB)), "실연권+저작권 + 인접권 30% · 추정", "up")}
</div>
<div class="card"><h2>📅 신곡 인접권 30%, 이렇게 나눠 드립니다</h2><div class="pgrid">
<div class="pbox"><div class="ph">1~5년차</div><div class="pb">신곡 인접권 수익의 <b>30%를 5년 동안</b> 아티스트에게 배분합니다</div></div>
<div class="pbox"><div class="ph">5년 이후</div><div class="pb">아티스트 몫(30%)이 <b>월 10만 원 미만</b>으로 줄어들면<br>그 30%를 저희가 <b>매입</b>합니다</div></div>
<div class="pbox"><div class="ph">아티스트가 얻는 것</div><div class="pb">5년간 꾸준한 배분 수익 +<br>이후 <b>매각 대금이라는 추가 수익</b></div></div>
</div></div>
<div class="card"><h2>${NEW_NAME} 하루 조회수</h2>${newChart}${newNote}</div>`;
const catFee = { b: monBefore * RATE_NB * FEE, a: monAfter * RATE_NB * FEE }, newFee = newAvg * 30 * RATE_NB * FEE;
const newDist = `${newHead}
<div class="tiles">
${tile(NEW_NAME + " 하루 평균", nf.format(Math.round(newAvg)) + "회", `${md(newOrg[0]?.d || yest)}~${md(yest)}`, "up")}
${tile("신곡 음원 매출", "월 " + man(newAvg * 30 * RATE_NB), "하루 평균 × 30일")}
${tile("신곡 유통사 수익", "월 " + man(newFee), `수수료 ${FEE * 100}% 가정`, "up")}
</div>
<div class="card"><h2>${NEW_NAME} 하루 조회수</h2>${newChart}${newNote}</div>`;
// ── 파이가 얼마나 커지나 (2026-10-27 민우님: "너네가 가진 마케팅 안 된 음원을 내가 인수해서 마케팅하면 파이가 얼마나 커지는지")
//   곡당 기준 = 이번 사례 곡 평균. 보수 = 인수한 카디코기 11곡 전체(안 오른 곡 포함) 곡당 평균 — 페이지엔 "보수적"으로만 표기.
const ALL_ACQ = [...ids, "mE-BhncAh6E", "Mmn_lwIf8xI", "nUkXoDO8hIE", "uxbCjFWcoGU", "VXGoK266B7A"];
const perBase = recent30 / ids.length;
const perCons = ALL_ACQ.reduce((a, id) => a + (avgOver(id, r30, yest) || 0), 0) / ALL_ACQ.length;
const perBefore = beforeTotal / ids.length;
const feeOf = (daily) => daily * 30 * RATE_NB * FEE;   // 곡 하루 스트리밍 → 유통사 월 수익
const pieRows = [10, 30, 50, 100].map((n) => `<tr><td class="dt">${n}곡</td><td>월 ${man(feeOf(perBefore) * n)}</td><td><b>월 ${man(feeOf(perCons) * n)}</b></td><td><b class="upc">월 ${man(feeOf(perBase) * n)}</b></td><td>연 ${man(feeOf(perCons) * n * 12)} ~ ${man(feeOf(perBase) * n * 12)}</td></tr>`).join("");
const pie = `<h3>🚀 귀사 카탈로그에 적용하면 — 파이가 얼마나 커지나</h3>
<div class="card"><h2>마케팅이 안 된 곡을 인수해 마케팅했을 때, 유통사 수익 (수수료 ${FEE * 100}% 가정)</h2>
<div class="tiles" style="margin-bottom:12px">
${tile("곡당 하루 스트리밍 · 지금", nf.format(Math.round(perBefore)) + "회", "마케팅 전 (이번 사례 곡당 평균)")}
${tile("곡당 하루 스트리밍 · 마케팅 후", nf.format(Math.round(perCons)) + " ~ " + nf.format(Math.round(perBase)) + "회", "보수적 ~ 이번 사례 평균", "up")}
${tile("곡당 유통사 수익 · 마케팅 후", "월 " + man(feeOf(perCons)) + " ~ " + man(feeOf(perBase)), "곡당 하루 스트리밍 × 30일 × 단가 × 수수료", "up")}
</div>
<div style="overflow-x:auto"><table class="pt"><thead><tr><th>인수 곡 수</th><th>지금 (마케팅 전)</th><th>마케팅 후 · 보수적</th><th>마케팅 후 · 이번 사례 수준</th><th>1년 기준</th></tr></thead><tbody>${pieRows}</tbody></table></div>
<div class="calc">
<label>인수 곡 수 <input id="pn" type="range" min="1" max="300" value="50"><b id="pnv">50</b>곡</label>
<label>신곡 추가 발매 <input id="pr" type="range" min="0" max="30" value="5"><b id="prv">5</b>곡</label>
<div class="cres">유통사 수익 <b id="pres"></b><div class="ax" id="pdet"></div></div>
</div>
<script>
(() => { const fc = ${JSON.stringify({ b: feeOf(perBefore), c: feeOf(perCons), a: feeOf(perBase), nw: newFee })};
  const man = (w) => w >= 1e8 ? (Math.round(w / 1e7) / 10) + '억 원' : w >= 1e4 ? Math.round(w / 1e4).toLocaleString('ko-KR') + '만 원' : Math.round(w).toLocaleString('ko-KR') + '원';
  const n = document.getElementById('pn'), r = document.getElementById('pr');
  const up = () => { const N = +n.value, R = +r.value; document.getElementById('pnv').textContent = N; document.getElementById('prv').textContent = R;
    const lo = fc.c * N + fc.nw * R, hi = fc.a * N + fc.nw * R;
    document.getElementById('pres').textContent = '월 ' + man(lo) + ' ~ ' + man(hi);
    document.getElementById('pdet').textContent = '지금(마케팅 전) 월 ' + man(fc.b * N) + ' → 1년 ' + man(lo * 12) + ' ~ ' + man(hi * 12) + ' · 신곡 1곡당 월 ' + man(fc.nw); };
  n.oninput = r.oninput = up; up(); })();
</script></div>`;
const box =(title, items) => `<div class="card"><h2>${title}</h2><div class="pgrid">${items.map(([h, b]) => `<div class="pbox"><div class="ph">${h}</div><div class="pb">${b}</div></div>`).join("")}</div></div>`;
const PAGES = [
  { dir: DIR, // 아티스트용
    title: "제안 · 인접권 인수 + 마케팅",
    h1: "🎤 잠들어 있던 내 곡, 다시 깨워 드립니다 — 늘어난 저작권·실연권 수입과 인지도는 아티스트 몫",   // 2026-10-27 민우님: "넘기고" 단어 별로
    intro: box("제안 구조", [
      ["아티스트가 가져가는 것", `<b>저작권 + 실연권 수입</b>은 그대로 아티스트 몫<br>스트리밍이 늘어난 만큼 함께 늘어납니다`],
      ["인지도", `누적 조회수 <b>${nf.format(atAcqTotal)}회 → ${nf.format(cumNow)}회</b><br>${md(yest)} 기준`],
      ["저희가 하는 것", `인접권 인수 후<br><b>마케팅 기획·집행·비용</b>을 직접 맡습니다`],
      // 2026-10-27 민우님: "이후 추가 발매 건에 대한 인접권을 내가 7 너가 3으로 나눈다"
      ["그다음", `<b>신곡 추가 발매</b>까지 함께<br>신곡은 저작권·실연권 + <b>인접권 30%(5년)</b>도 아티스트 몫`],   // 2026-10-27 민우님: 30%는 5년 배분, 5년 뒤 월 10만 원 미만이면 매입
    ]),
    money: moneyCard + newArtist,
    moneyNote: `· 수익 = 하루 조회수 × 30일 × 스트림당 단가(인수 전 인접권 ${RATE_NB}원 · 실연권+저작권 ${RATE_CP.toFixed(2)}원).<br>· 실연권+저작권 금액은 국내 음원 스트리밍 배분 비율(제작자 48.25% · 저작권자 10.5% · 실연자 6.25%)로 환산한 <b>추정치</b>입니다. 유튜브뮤직은 별도 계약으로 정산돼 실제 금액은 다를 수 있습니다.` },
  { dir: "case-b-r7m4k1", // 유통사용
    title: "사례 · 저활성 카탈로그 재활성화",
    h1: "📈 발매 후 묻혀 있던 곡, 다시 살린 사례",
    intro: box("어떻게 했나", [
      ["대상", `발매 후 하루 스트리밍이<br><b>곡당 수십 회</b> 수준이던 기존 발매곡 ${ids.length}곡`],
      ["방법", `인접권을 인수해<br><b>직접 마케팅</b>으로 다시 노출`],
      ["결과", `하루 스트리밍 <b>${nf.format(Math.round(beforeTotal))}회 → ${nf.format(Math.round(recent30))}회</b><br>약 ${mult(recent30, beforeTotal)}배`],
      ["그다음", `같은 아티스트 <b>신곡 추가 발매</b><br>발매할 때마다 유통 매출이 더해집니다`],
    ]),
    money: `<h3>💰 유통 매출로 보면 (한 달 기준 · 기존 발매곡 ${ids.length}곡)</h3>
<div class="tiles">
${tile("인수 전 음원 매출", "월 " + man(monBefore * RATE_NB), "인수 전 하루 평균 × 30일")}
${tile("지금 음원 매출", "월 " + man(monAfter * RATE_NB), `${md(r30)}~${md(yest)} 하루 평균 × 30일 · 약 ${mult(monAfter, monBefore)}배`, "up")}
${tile("인수 전 유통사 수익", "월 " + man(catFee.b), `수수료 ${FEE * 100}% 가정`)}
${tile("지금 유통사 수익", "월 " + man(catFee.a), `수수료 ${FEE * 100}% 가정`, "up")}
</div>` + newDist + `
<h3>📦 합치면 (유통사 수익, 한 달 기준)</h3>
<div class="tiles">
${tile("인수 전", "월 " + man(catFee.b), `기존 발매곡 ${ids.length}곡`)}
${tile("지금 — 기존곡 + 신곡 1곡", "월 " + man(catFee.a + newFee), `기존곡 ${man(catFee.a)} + 신곡 ${man(newFee)}`, "up")}
${tile("추가 발매 1곡당 더해진 수익", "월 +" + man(newFee), "신곡이 나올 때마다 쌓입니다")}
</div>` + pie,
    moneyNote: `· 음원 매출 = 하루 조회수 × 30일 × 스트림당 ${RATE_NB}원(유튜브뮤직 제작자 정산 단가 기준 추정). 유통사 수익 = 음원 매출 × 수수료 ${FEE * 100}%(가정). 실제 수수료율은 계약마다 다릅니다.` },
];
for (const p of PAGES) {
  const out = join(ROOT, p.dir);
  if (!existsSync(out)) mkdirSync(out);
  writeFileSync(join(out, "index.html"), page(p).replace("</style>", "  .pgrid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:10px; margin-bottom:8px; } .pbox { background:#11151c; border:1px solid var(--line); border-radius:10px; padding:12px 14px; } .ph { color:var(--muted); font-size:12px; margin-bottom:6px; } .pb { font-size:14px; line-height:1.6; } .adz { fill:#2a303c; } table.pt { width:100%; border-collapse:collapse; font-size:13.5px; } .pt th, .pt td { text-align:right; padding:9px 12px; border-bottom:1px solid var(--line); white-space:nowrap; } .pt th { color:var(--muted); font-weight:600; font-size:12px; } .pt th:first-child, .pt td.dt { text-align:left; } .upc { color:var(--up); } .calc { display:flex; flex-wrap:wrap; gap:14px 28px; align-items:center; margin:16px 0 8px; padding:14px; background:#11151c; border:1px solid var(--line); border-radius:10px; font-size:13.5px; } .calc input { vertical-align:middle; margin:0 8px; width:160px; } .cres { font-size:14px; } .cres b { font-size:20px; color:var(--up); }\n</style>"), "utf8");
  console.log(`[완료] ${p.dir}/index.html`);
}
console.log(`인수전 ${Math.round(beforeTotal)}/일 → ${Math.round(recent30)}/일 (${mult(recent30, beforeTotal)}배), 인수후 +${gained}, 누적 ${atAcqTotal}→${cumNow}`);