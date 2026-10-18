import { useEffect, useMemo, useState } from 'react'
import { DateChips } from '../components/DateChips'
import { MountainBadge } from '../components/MountainBadge'
import { SightChips } from '../components/SightChips'
import { formatEle, loadMajorMountains, toMountain, type Mountain } from '../data/mountains'
import { inPrefecture, PREFECTURES } from '../data/prefectures'
import type { SightFilter } from '../data/recommendations'
import { formatDateShort } from '../logic/date'
import { KOYO_LABELS } from '../logic/koyo'
import { WEATHER_CLASS_LABELS } from '../logic/recommend'
import {
  decodeDay,
  type DayRecommendation,
  type RecommendationsFile,
} from '../logic/recommendationsFile'
import { describeWeather } from '../logic/weather'

const MAX_ROWS = 100

type Group = 'all' | 'famous' | 'rank1'

const GROUP_OPTIONS: { value: Group; label: string }[] = [
  { value: 'all', label: '種類：すべて' },
  { value: 'famous', label: '二百・三百名山まで' },
  { value: 'rank1', label: '百名山' },
]

type Props = {
  targetDate: string
  onTargetDateChange: (date: string) => void
  sight: SightFilter
  onSightChange: (sight: SightFilter) => void
  recommendations: RecommendationsFile | null
  onSelect: (mountain: Mountain) => void
}

type Row = { mountain: Mountain; day: DayRecommendation }

export function RecommendPage({
  targetDate,
  onTargetDateChange,
  sight,
  onSightChange,
  recommendations,
  onSelect,
}: Props) {
  const [mountains, setMountains] = useState<Mountain[] | null>(null)
  const [pref, setPref] = useState('')
  const [group, setGroup] = useState<Group>('all')
  const [showBad, setShowBad] = useState(false)

  useEffect(() => {
    loadMajorMountains().then((c) =>
      setMountains(c.features.map((f) => toMountain(f.properties, f.geometry.coordinates))),
    )
  }, [])

  const { rows, badCount } = useMemo(() => {
    if (!mountains || !recommendations) return { rows: [] as Row[], badCount: 0 }
    let bad = 0
    const result: Row[] = []
    for (const m of mountains) {
      const day = decodeDay(recommendations, m.id, targetDate)
      if (!day) continue
      if (pref && !inPrefecture(m.pref, pref)) continue
      if (group === 'famous' && m.rank === undefined) continue
      if (group === 'rank1' && m.rank !== 1) continue
      if (sight === 'koyo' && day.koyo !== 'starting' && day.koyo !== 'peak') continue
      if (day.weather === 'bad') {
        bad++
        if (!showBad) continue
      }
      result.push({ mountain: m, day })
    }
    // おすすめ度 → 名山 → 標高の順
    result.sort(
      (a, b) =>
        b.day.score - a.day.score ||
        (a.mountain.rank ?? 3) - (b.mountain.rank ?? 3) ||
        (b.mountain.ele ?? 0) - (a.mountain.ele ?? 0),
    )
    return { rows: result, badCount: bad }
  }, [mountains, recommendations, targetDate, pref, group, sight, showBad])

  return (
    <section className="page recommend-page">
      <h1>おすすめ</h1>
      <div className="recommend-controls">
        <DateChips value={targetDate} onChange={onTargetDateChange} />
        <SightChips date={targetDate} value={sight} onChange={onSightChange} />
        <div className="search-filters">
          <select value={pref} onChange={(e) => setPref(e.target.value)} aria-label="都道府県">
            <option value="">都道府県：すべて</option>
            {PREFECTURES.map((p) => (
              <option key={p}>{p}</option>
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
      </div>

      {!recommendations && (
        <p className="sub">
          おすすめのデータがまだありません。毎朝4時ごろに主要な山の分を計算します。
        </p>
      )}
      {recommendations && !recommendations.dates.includes(targetDate) && (
        <p className="sub">{formatDateShort(targetDate)}のおすすめはまだ計算されていません。</p>
      )}

      {recommendations && mountains && (
        <>
          <p className="sub">
            {formatDateShort(targetDate)}：{rows.length.toLocaleString()}山
            {rows.length > MAX_ROWS && `（上位${MAX_ROWS}山を表示）`}
            {badCount > 0 && !showBad && `・天気が悪い${badCount}山を除外`}
          </p>
          {badCount > 0 && (
            <label className="check">
              <input type="checkbox" checked={showBad} onChange={(e) => setShowBad(e.target.checked)} />
              天気が悪い山も表示する
            </label>
          )}
          <ul className="recommend-list">
            {rows.slice(0, MAX_ROWS).map(({ mountain: m, day }) => {
              const w = day.weatherCode === null ? null : describeWeather(day.weatherCode)
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    className={`result recommend-row${day.weather === 'bad' ? ' is-bad' : ''}`}
                    onClick={() => onSelect(m)}
                  >
                    <span className="recommend-main">
                      <span className="result-name">
                        {m.name}
                        <MountainBadge mountain={m} />
                      </span>
                      <span className="result-meta">
                        {m.pref}・{formatEle(m.ele)}
                      </span>
                    </span>
                    <span className="recommend-side">
                      <span>
                        {w?.icon} {WEATHER_CLASS_LABELS[day.weather]}
                      </span>
                      {day.koyo !== 'off' && (
                        <span className={`koyo-tag koyo-${day.koyo}`}>紅葉 {KOYO_LABELS[day.koyo]}</span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="note">
            主要な約1,000山について、毎朝の予報から計算しています（山頂の標高・登山の時間帯の天気）。
            目安なので、出発前に公式の気象情報を確認してください。
          </p>
        </>
      )}
    </section>
  )
}
