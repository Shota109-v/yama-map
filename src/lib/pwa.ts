// ホーム画面に追加して開いているか（PWA として動いているか）

/** ホーム画面のアイコンから開いているか */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true
}

/** iPhone・iPad の Safari か（ホーム画面への追加は共有ボタンから行う） */
export function isIOS(): boolean {
  const ua = navigator.userAgent
  // iPadOS の Safari は Mac と名乗るので、タッチ対応かどうかでも判定する
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}
