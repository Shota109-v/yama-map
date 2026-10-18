import { useEffect, useMemo, useRef, useState } from 'react'
import { formatEle, loadAllMountains, type Mountain } from '../data/mountains'

const MAX_RESULTS = 50

const PREFECTURES = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
  '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
  '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
  '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
]

const MIN_ELE_OPTIONS = [0, 500, 1000, 1500, 2000, 2500, 3000]

function toHiragana(s: string) {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
}

type Props = {
  onSelect: (mountain: Mountain) => void
  onClose: () => void
}

export function SearchPanel({ onSelect, onClose }: Props) {
  const [mountains, setMountains] = useState<Mountain[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [pref, setPref] = useState('')
  const [minEle, setMinEle] = useState(0)
  const [majorOnly, setMajorOnly] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    loadAllMountains().then(setMountains, (e: Error) => setError(e.message))
  }, [])

  const results = useMemo(() => {
    if (!mountains) return []
    const q = toHiragana(query.trim())
    if (!q && !pref && !minEle && !majorOnly) return []
    const hits = mountains.filter(
      (m) =>
        (!q || m.name.includes(q) || (m.yomi && toHiragana(m.yomi).includes(q))) &&
        // 県境の山は「富山県 長野県」のように複数の県が入っている
        (!pref || m.pref.split(/\s+/).includes(pref)) &&
        (!minEle || (m.ele ?? 0) >= minEle) &&
        (!majorOnly || m.major),
    )
    // 名前が一致する山 → 主要な山 → 標高の高い山の順
    const rank = (m: Mountain) =>
      (q && (m.name === q || m.yomi === q) ? 0 : 2) + (m.major ? 0 : 1)
    hits.sort((a, b) => rank(a) - rank(b) || (b.ele ?? 0) - (a.ele ?? 0))
    return hits
  }, [mountains, query, pref, minEle, majorOnly])

  const hasCondition = query.trim() || pref || minEle || majorOnly

  return (
    <div className="search-panel">
      <div className="search-header">
        <input
          ref={inputRef}
          type="search"
          className="search-input"
          placeholder="山名・よみがなで検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="text-button" onClick={onClose}>
          閉じる
        </button>
      </div>

      <div className="search-filters">
        <select value={pref} onChange={(e) => setPref(e.target.value)} aria-label="都道府県">
          <option value="">都道府県：すべて</option>
          {PREFECTURES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select value={minEle} onChange={(e) => setMinEle(Number(e.target.value))} aria-label="標高">
          {MIN_ELE_OPTIONS.map((v) => (
            <option key={v} value={v}>
              {v ? `${v.toLocaleString()}m以上` : '標高：すべて'}
            </option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={majorOnly} onChange={(e) => setMajorOnly(e.target.checked)} />
          主要な山のみ
        </label>
      </div>

      <div className="search-results">
        {error && <p className="sub">{error}</p>}
        {!error && !mountains && <p className="sub">山のデータを読み込み中…</p>}
        {mountains && !hasCondition && (
          <p className="sub">{mountains.length.toLocaleString()}山から探せます</p>
        )}
        {mountains && hasCondition && results.length === 0 && <p className="sub">見つかりませんでした</p>}
        {results.length > 0 && (
          <p className="sub">
            {results.length.toLocaleString()}件
            {results.length > MAX_RESULTS && `（上位${MAX_RESULTS}件を表示）`}
          </p>
        )}
        <ul>
          {results.slice(0, MAX_RESULTS).map((m) => (
            <li key={m.id}>
              <button type="button" className="result" onClick={() => onSelect(m)}>
                <span className="result-name">
                  {m.name}
                  {m.major && <span className="badge">主要</span>}
                </span>
                <span className="result-meta">
                  {m.yomi && `${m.yomi}・`}
                  {m.pref}・{formatEle(m.ele)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
