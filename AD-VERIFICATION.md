# 이별행동 최근 하루 광고 차감 검증 (2026-09-29 KST)

대상: `I2Akn5oSvLY` / 차가을 - 이별행동. 이번 변경은 곡별 표의 **최근 하루 스트리밍 셀**에 한정한다.

## 관측 결과

- `data/snapshots.json`: 2026-09-28 00:00의 2,176 → 2026-09-29 00:00의 29,252, 전체 증가 **27,076**. 시각은 수집 파일에 기록된 분 단위이며 실제 재생 발생 시각이 아니다.
- Google Ads API v22, 기존 OAuth의 read-only `googleAds:search` 사용. `SELECT customer.time_zone FROM customer` → **Asia/Seoul**.
- 00:07 KST `video.id='I2Akn5oSvLY'`, `segments.date='2026-09-28'`: `metrics.impressions=3828`, `metrics.video_trueview_views=1517`.
- 00:08 KST 대상 단일 영상 광고의 `ad_group_ad` 보고: **impressions 3830 / interactions 2271 / video_trueview_views 1518**. 해당 광고의 단일 video asset → 대상 영상 ID를 별도 조회하여 연결 확인. 아직 갱신 중이며 확정값이 아니다.
- `metrics.video_views`, `metrics.youtube_public_views`, `metrics.video_earned_views` → v22 `UNRECOGNIZED_FIELD`. `googleAdsFields:search`의 `metrics.%view%` 목록으로도 공개/earned 조회 지표 미제공 확인.
- `video` 리소스는 `segments.hour`와 `metrics.interactions`를 지원하지 않아 각각 segment/metric incompatibility 응답. 이번 스냅샷은 KST 일 경계에 맞지만 지표의 **공개 카운터 반영 구간**은 검증되지 않았다.

## 차감하지 않은 이유

- **노출(impressions)**: 광고/썸네일 노출, 조회수 대체 불가.
- **interactions**: 광고 유형별 주요 참여, 공개 조회수 대체 불가.
- **TrueView**: 일정 시청시간 또는 상호작용 기준. 유튜브 공개 카운터에 포함되는 **YouTube public views**와 다르다.
- **earned views**: 광고 시청 이후 7일 이내 연결 채널의 후속 시청. 해당 영상의 유료 공개조회가 아니다.
- Google 공식 안내: Google Ads와 YouTube 공개 카운터는 갱신 시점/무효 트래픽/집계 자격이 다름. YTA 트래픽 소스는 48–72시간 지연, Ads는 수 시간 지연 가능. 무효조회 보정은 최대 30일까지 가능. 단순히 며칠 기다린다고 관측 카운터와 광고 발생일이 정확히 같아지는 것은 아니다.
- 따라서 **동일 관측기간에 공개 카운터에 반영된 광고분 = 미확인**, **차감후 실제 증가 = 미확인**. 27,076−3,828=23,248이나 27,076−1,518=25,558을 실제 유기적 증가로 표시하지 않는다.

## 변경 경계

- 시작 상태 main clean. 조사 도중 별도 작업이 `c6207255`(노출수 기록/기존 기간제외 제거)와 `a31c9766`(자동수집)을 반영한 것을 확인했다. 그 작업을 되돌리거나 노출 기반 전체 합산을 이번에 재설계하지 않았다.
- 기존 `songs.json`의 대상 `adVerificationPending: true`를 빌드가 보존하고, 해당 셀은 검증 보고서를 우선 사용한다. 레거시 `adViewsByDay`는 이 셀의 광고조회수 근거로 사용하지 않는다.
- 정확한 시작/끝/시간대, 원본 카운터, 공개 광고조회 지표, 공개 카운터 반영 구간 검증이 모두 일치한 보고서만 차감 가능. 없거나 기간이 바뀌면 **미확인** 유지. 과거 값 재사용/0 취급/기간 통째 제외 없음.
- 기존 전체 합계·수익 계산과 다른 곡은 변경하지 않았다. 따라서 기존 합계에 남은 노출수 기반 계산까지 검증 완료했다는 뜻이 아니다.
- 기존 광고 수집기와 예약/광고 집행/예산/입찰/기간/구매는 변경 또는 실행하지 않음. `node fetch.mjs --render`로 정상 빌드만 실행; 수집 스냅샷 원본은 보존.
- 테스트: `node --test test-recent-day-ads.mjs` (23 cases). 실제 Chromium 로컬 렌더링에서 대상 셀 외 모든 곡별 셀, 요약/수익 카드, 유통사/일별/월별 표가 변경 전과 동일함을 비교. 페이지 JS 오류 없음.

## 근거 문서

- https://support.google.com/google-ads/answer/2375431?hl=en
- https://support.google.com/google-ads/answer/2544985?hl=en

정확 차감의 blocker: 기존 v22 조회 흐름에서 공개 광고조회 지표를 얻지 못했고, 동일 기간 공개 카운터에 실제 반영된 광고분을 검증할 자료가 없음. 계정 화면의 public views 내보내기 또는 권한 있는 YouTube Analytics 광고 트래픽 자료를 확보하더라도 집계 시간대·반영 지연 정합은 별도로 검증해야 한다. 이번 화면 수정은 완료 가능하지만 정확 차감값 확인은 미완료다.
