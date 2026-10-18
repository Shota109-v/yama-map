import { useEffect, useMemo, useRef, useState } from 'react'
import { MountainBadge } from '../components/MountainBadge'
import { formatEle, loadAllMountains, type Mountain } from '../data/mountains'
import { inPrefecture, PREFECTURES } from '../data/prefectures'

// 百名山を一覧で見られるよう100件まで表示する
const MAX_RESULTS = 100

const MIN_ELE_OPTIONS = [0, 500, 1000, 1500, 2000, 2500, 3000]

type Group = 'all' | 'major' | 'famous' | 'rank1'

const GROUP_OPTIONS: { value: Group; label: string }[] = [
  { value: 'all', label: '種類：すべて' },
  { value: 'major', label: '主要な山' },
  { value: 'famous', label: '二百・三百名山まで' },
  { value: 'rank1', label: '百名山' },
]

function inGroup(m: Mountain, group: Group) {
  if (group === 'major') return m.major
  if (group === 'famous') return m.rank !== undefined
  if (group === 'rank1') return m.rank === 1
  return true
}

// 「ヶ」「ヵ」は山名の一部（槍ヶ岳など）なので変換しない
function toHiragana(s: string) {
  return s.replace(/[ァ-ヴ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
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
  const [group, setGroup] = useState<Group>('all')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    loadAllMountains().then(setMountains, (e: Error) => setError(e.message))
  }, [])

  const results = useMemo(() => {
    if (!mountains) return []
    const q = query.trim()
    // よみがなはカタカナで入力されても探せるようにする
    const qKana = toHiragana(q)
    if (!q && !pref && !minEle && group === 'all') return []
    const hits = mountains.filter(
      (m) =>
        (!q || m.name.includes(q) || (m.yomi && m.yomi.includes(qKana))) &&
        (!pref || inPrefecture(m.pref, pref)) &&
        (!minEle || (m.ele ?? 0) >= minEle) &&
        inGroup(m, group),
    )
    // 名前が一致する山 → 名山・主要な山 → 標高の高い山の順
    const order = (m: Mountain) =>
      (q && (m.name === q || m.yomi === qKana) ? 0 : 10) + (m.rank ?? (m.major ? 3 : 4))
    hits.sort((a, b) => order(a) - order(b) || (b.ele ?? 0) - (a.ele ?? 0))
    return hits
  }, [mountains, query, pref, minEle, group])

  const hasCondition = query.trim() || pref || minEle || group !== 'all'

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
        <select value={group} onChange={(e) => setGroup(e.target.value as Group)} aria-label="山の種類">
          {GROUP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
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
                  <MountainBadge mountain={m} />
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
