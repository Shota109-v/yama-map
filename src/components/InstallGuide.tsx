import { useState } from 'react'
import { loadJson, saveJson } from '../lib/storage'
import { isIOS, isStandalone } from '../lib/pwa'

const DISMISS_KEY = 'yama-map:install-guide'
/** 閉じてから、もう一度案内するまでの日数 */
const REMIND_DAYS = 14

/** ホーム画面への追加の手順（設定画面でも使う） */
export function InstallSteps() {
  if (isIOS()) {
    return (
      <ol className="install-steps">
        <li>Safari で画面下の共有ボタン（□に↑）を押す</li>
        <li>「ホーム画面に追加」を選ぶ</li>
        <li>右上の「追加」を押す</li>
        <li>ホーム画面の「山マップ」のアイコンから開く</li>
      </ol>
    )
  }
  return (
    <ol className="install-steps">
      <li>ブラウザのメニュー（︙ など）を開く</li>
      <li>「ホーム画面に追加」または「アプリをインストール」を選ぶ</li>
      <li>追加されたアイコンから開く</li>
    </ol>
  )
}

/** ホーム画面から開いていないときに出す案内 */
export function InstallGuide() {
  const [visible, setVisible] = useState(() => {
    if (isStandalone()) return false
    const { dismissedAt } = loadJson<{ dismissedAt: string | null }>(DISMISS_KEY, { dismissedAt: null })
    return !dismissedAt || Date.now() - Date.parse(dismissedAt) > REMIND_DAYS * 86400000
  })

  if (!visible) return null

  const close = () => {
    saveJson(DISMISS_KEY, { dismissedAt: new Date().toISOString() })
    setVisible(false)
  }

  return (
    <div className="install-guide" role="dialog" aria-label="ホーム画面への追加">
      <div className="install-card">
        <strong>ホーム画面に追加して使ってください</strong>
        <p className="sub">
          ホーム画面から開くと、アプリのように全画面で使えます。また、登山記録などのデータが自動で消されにくくなります。
        </p>
        <InstallSteps />
        <button type="button" className="research-button" onClick={close}>
          わかった
        </button>
      </div>
    </div>
  )
}
