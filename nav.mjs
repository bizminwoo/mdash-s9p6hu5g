// 사이트 상단 탭 — 페이지를 추가하거나 이름을 바꿀 때는 여기 한 곳만 고치면 모든 페이지에 반영된다.
// 각 템플릿은 <!--__NAV__--> 자리에 navHtml(현재파일명) 결과가 들어간다.
export const TABS = [
  ["index.html", "🎵 음원 대시보드"],
  ["ai.html", "🤖 AI 음원"],
  ["funds.html", "💼 자금 현황"],
  ["trending.html", "🎯 경쟁사 분석"],
  // 구보 BEP(bep.html)는 안 써서 탭에서 뺐다. 페이지 자체는 계속 생성되니 주소로는 접근 가능.
];

export function navHtml(current) {
  return '<div id="sitetabs">' + TABS.map(([href, label]) =>
    href === current ? `<a href="#" class="on">${label}</a>` : `<a href="${href}">${label}</a>`
  ).join("") + "</div>";
}
