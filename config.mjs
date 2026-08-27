// 환경 설정 파일
// yt-dlp 실행 파일 경로 — 이 PC에 설치된 위치를 먼저 보고, 없으면 예전 주 PC 경로를 쓴다.
// (윈도우에서도 슬래시 경로가 그대로 동작한다)
import { existsSync } from "node:fs";
const CANDIDATES = [
  "C:/Users/이민우/AppData/Local/Python/pythoncore-3.14-64/Scripts/yt-dlp.exe",
  "C:/Users/PC/AppData/Local/Python/pythoncore-3.14-64/Scripts/yt-dlp.exe",
];
export const YTDLP = CANDIDATES.find((p) => existsSync(p)) || CANDIDATES[0];
