import { useState } from 'react'
import { InstallSteps } from '../components/InstallGuide'
import { loadApiKey, saveApiKey } from '../data/apiKey'
import { isStandalone } from '../lib/pwa'
import type { RecommendationsFile } from '../logic/recommendationsFile'
import { BASE_MAP_LABELS, type BaseMapType } from '../map/baseMap'
import { BackupSetting } from './BackupSetting'

type Props = {
  baseMapType: BaseMapType
  onBaseMapTypeChange: (type: BaseMapType) => void
  recommendations: RecommendationsFile | null
}

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export function SettingsPage({ baseMapType, onBaseMapTypeChange, recommendations }: Props) {
  const standalone = isStandalone()
  return (
    <section className="page">
      <h1>設定</h1>

      <h2>地図の種類</h2>
      <div className="option-list">
        {(Object.keys(BASE_MAP_LABELS) as BaseMapType[]).map((type) => (
          <label key={type} className="option">
            <input
              type="radio"
              name="base-map"
              checked={baseMapType === type}
              onChange={() => onBaseMapTypeChange(type)}
            />
            {BASE_MAP_LABELS[type]}
          </label>
        ))}
      </div>

      <h2>バックアップ（登山記録・お気に入り）</h2>
      <BackupSetting />

      <h2>「最新情報を調べる」（Claude API）</h2>
      <ApiKeySetting />

      <h2>ホーム画面への追加</h2>
      {standalone ? (
        <p className="sub">ホーム画面から開いています。データは自動で消されにくい状態です。</p>
      ) : (
        <>
          <p className="warn">まだホーム画面から開いていません。</p>
          <InstallSteps />
        </>
      )}

      <h2>このアプリについて</h2>
      <ul className="sub credits">
        <li>アプリの版：{formatDateTime(__BUILD_TIME__)} 版</li>
        <li>
          おすすめデータ：
          {recommendations ? `${formatDateTime(recommendations.generatedAt)} に計算（毎朝4時ごろ更新）` : 'まだありません'}
        </li>
        <li>表示している情報は目安です。出発前に公式の気象情報と現地の最新情報を確認してください。</li>
      </ul>

      <h2>出典</h2>
      <ul className="sub credits">
        <li>地図：国土地理院（地理院タイル）</li>
        <li>主要な山：国土地理院「日本の主な山岳標高」</li>
        <li>その他の山：© OpenStreetMap contributors（ODbL）</li>
        <li>百名山・二百名山・三百名山の一覧：Wikidata（CC0）</li>
        <li>都道府県の判定：地球地図日本（国土地理院）</li>
        <li>天気予報：Open-Meteo（CC BY 4.0）</li>
      </ul>
    </section>
  )
}

function ApiKeySetting() {
  const [saved, setSaved] = useState(() => loadApiKey())
  const [draft, setDraft] = useState('')

  const save = () => {
    const value = draft.trim()
    if (!value) return
    saveApiKey(value)
    setSaved(value)
    setDraft('')
  }

  const remove = () => {
    saveApiKey(null)
    setSaved(null)
  }

  return (
    <div className="api-key">
      {saved ? (
        <div className="api-key-row">
          <span>設定済み（末尾 …{saved.slice(-4)}）</span>
          <button type="button" className="text-button" onClick={remove}>
            削除する
          </button>
        </div>
      ) : (
        <div className="api-key-row">
          <input
            type="password"
            className="search-input"
            placeholder="API キー（sk-ant-…）"
            autoComplete="off"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="button" className="text-button" onClick={save} disabled={!draft.trim()}>
            保存
          </button>
        </div>
      )}
      <p className="note">
        山の詳細パネルの「最新情報を調べる」で使います。キーはこの端末の中にだけ保存され、公開しているページには含まれません。
        Claude Console でこのアプリ専用のキーを作り、利用額の上限を設定しておくと安心です。1回の調査で約20〜40円かかります。
      </p>
    </div>
  )
}
