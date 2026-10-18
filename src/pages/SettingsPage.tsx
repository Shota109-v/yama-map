import { BASE_MAP_LABELS, type BaseMapType } from '../map/baseMap'

type Props = {
  baseMapType: BaseMapType
  onBaseMapTypeChange: (type: BaseMapType) => void
}

export function SettingsPage({ baseMapType, onBaseMapTypeChange }: Props) {
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

      <h2>出典</h2>
      <ul className="sub credits">
        <li>地図：国土地理院（地理院タイル）</li>
        <li>主要な山：国土地理院「日本の主な山岳標高」</li>
        <li>その他の山：© OpenStreetMap contributors（ODbL）</li>
        <li>百名山・二百名山・三百名山の一覧：Wikidata（CC0）</li>
        <li>都道府県の判定：地球地図日本（国土地理院）</li>
      </ul>
    </section>
  )
}
