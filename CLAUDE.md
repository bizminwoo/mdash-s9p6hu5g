# 음원 스트리밍 대시보드

유튜브(뮤직) 곡별 스트리밍을 매시간 수집해 GitHub Pages로 배포하는 대시보드.
사용자는 음원사업자이며, 발매곡·경쟁사 곡의 하루/시간 단위 스트리밍 추이를 본다.

- 공개 URL: https://bizminwoo.github.io/mdash-s9p6hu5g/ (noindex)
- 이 저장소 = 수집 파이프라인 + 데이터 + 정적 페이지 전부. push 하면 곧 배포다.

## 구조

```
fetch.mjs              내 곡+마케팅 수집 → data/snapshots.json → index.html + bep.html 생성
fetch-trending.mjs     인기급상승 차트 30곡 + 경쟁사 수집 → data/trending.json → trending.html 생성
fetch-spotify.mjs      스포티파이 인기도(보류 중 — 아래 참고) → data/spotify.json
*.template.html        페이지 템플릿. /*__DATA__*/ null 자리에 JSON 주입 방식
songs.json             내 곡 목록 {url, title, share} — share: 수익 지분(0=선급 제외, 0.5=공동제작)
competitors.json       경쟁사 곡 {url, title, likes?} — likes:true면 시간별 좋아요+조회수 상세 추적
marketing.json         마케팅 참고 트랙 (수익/합계 미포함, 대시보드 별도 섹션)
experiments.json       구보(구독보장) 캠페인 기록 → bep.html 손익분기 분석
data/                  수집 데이터 (git으로 관리됨 — 지우면 안 됨)
.github/workflows/hourly-collect.yml   매시간 수집 워크플로
funds.html             자금 현황 (별도 문서에서 생성됨 — 자금 데이터 갱신은 사용자만)
```

곡 추가/삭제 = 해당 json 수정 후 push. 다음 수집 때 자동 반영, 줄을 지우면 목록에서 빠진다.
경쟁사 곡은 **아트트랙(Topic 채널 음원 영상) 기준** — MV/공식오디오 아님. 못 찾으면 등록하지 말 것.

## 수집 (3중 구조)

1. **GitHub Actions** (hourly-collect.yml, cron `5,25,45 * * * *`): 기본 수집원.
   조회수·좋아요 = YouTube Data API(시크릿 `YT_API_KEY`), 차트 목록 = charts.youtube.com innertube.
   GitHub 예약은 지연·누락이 잦아서(정각 슬롯은 특히) 시간당 3회 걸어둠.
2. **주 PC 정각 수집** (작업 스케줄러 "MusicDashboard-Daily", 매시 00분): PC가 켜져 있으면
   정각 1~3분 내 갱신. 리포 밖 `C:\Users\PC\music-dashboard\run.bat` 실행 (pull→수집→push).
   로컬 수집은 API 키 없이 yt-dlp/innertube 폴백을 쓴다 (yt-dlp 경로는 config.mjs, PYTHONUTF8=1 필수).
3. **주 PC 감시견** ("MusicDashboard-Watchdog", 매시 12·42분): 원격 data의 실제 수집 시각을 보고
   이번 시간대 수집이 없으면 백업 수집. (커밋 시각이 아니라 **데이터 안의 시각**을 봐야 함 — 과거 사고 있었음)

다른 컴퓨터에서는 코드 수정→push만 하면 된다. 수집은 GitHub/주 PC가 알아서 한다.
직접 수집을 돌리려면: `node fetch.mjs && node fetch-trending.mjs` (환경변수 YT_API_KEY 있으면 Data API 사용).

## 데이터 모델 (핵심 규칙)

- **날짜별 스냅샷** = 그날 첫 수집값으로 고정, 재수집해도 안 덮음 (신규 곡 기준값만 추가).
  하루 스트리밍 = 다음날 스냅샷 − 그날 스냅샷. `locked: true` 스냅샷은 절대 수정 금지 (실측 보정값).
- **시간별 칸** (`hourly[날짜][시]`) = **그 시간의 첫 수집만 기록(write-once)** — 백업 수집이 늦게 와도 안 덮음.
  수집된 "분"을 `hourlyMin`에 함께 기록한다.
- **정각 환산(estAt)**: 화면의 모든 시간 단위 수치는 수집 시각과 무관하게 **정각(H:00) 값으로 비례 환산**해서
  표시한다 (사용자 강한 요구사항 — "16:40에 수집돼도 16시 데이터로"). 템플릿의 estAt()/mkSampler() 참조.
  150분 넘는 수집 공백은 보간하지 않음(null).
- 수익: 하루 1,000회 ≈ 월 25만원 기준, × share. 오늘 예상(추정) = 최근 7일의 "N시까지 소진율" 평균으로 환산.

## push 규칙

여러 주체(Actions 봇, 주 PC, 다른 세션)가 같은 repo에 push한다. **커밋 전 반드시
`git pull --rebase -X theirs`**, 실패 시 `git rebase --abort` 후 재시도. push만 하고 pull 안 하면
non-fast-forward로 조용히 실패해 웹이 몇 시간씩 멈춘 사고가 있었다.

## 보류/주의

- **스포티파이 인기도**: 코드 완성돼 있으나 스포티파이 정책상 앱 소유 계정에 프리미엄 필요 → 보류.
  프리미엄 생기면 `gh secret set SPOTIFY_CLIENT_ID/SECRET` 두 개 등록만 하면 켜진다.
  현재 실패해도 조용히 건너뛰며 화면엔 "—"로 나온다.
- **funds.html(자금 현황)**: 법인 자금 문서. 갱신은 사용자가 직접 한다 — Claude가 자금 데이터를
  임의로 재생성·게시하지 말 것.
- 대시보드 UI 변경 시 템플릿은 이 저장소 것이 원본. (주 PC의 `music-dashboard/` 루트에 사본이 있으나 dormant)
- 사용자 선호: 일자별 매트릭스가 핵심 뷰, 시간 단위 정각 기준 표시, small multiples(곡별 자기 스케일),
  화면 배치 바꿀 땐 반드시 먼저 물어볼 것 (패널 위치에 민감).
