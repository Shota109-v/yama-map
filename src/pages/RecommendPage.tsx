import { useEffect, useMemo, useState } from 'react'
import { DateSelect } from '../components/DateSelect'
import { MountainBadge } from '../components/MountainBadge'
import { SightChips } from '../components/SightChips'
import { SightTag } from '../components/SightTag'
import { formatEle, loadMajorMountains, toMountain, type Mountain } from '../data/mountains'
import { inPrefecture, PREFECTURES } from '../data/prefectures'
import type { SightFilter } from '../data/recommendations'
import { useClimbedIds } from '../data/useRecords'
import { formatDateShort } from '../logic/date'
import { bestLevel, recommendScore, WEATHER_CLASS_LABELS } from '../logic/recommend'
import { isNotable, sightScore, type SightId, type SightLevel } from '../logic/sights'
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

type Row = { mountain: Mountain; day: DayRecommendation; score: number }

/** 一覧に出す見どころ（絞り込み中はその見どころ、そうでなければ期待できるものを点数順に2つまで） */
function rowSights(day: DayRecommendation, sight: SightFilter): [SightId, SightLevel][] {
  const entries = Object.entries(day.sights) as [SightId, SightLevel][]
  if (sight !== 'all') return entries.filter(([id]) => id === sight)
  return entries
    .filter(([, level]) => isNotable(level) || level === 'past')
    .sort((a, b) => sightScore(b[1]) - sightScore(a[1]))
    .slice(0, 2)
}

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
  const [unclimbedOnly, setUnclimbedOnly] = useState(false)
  const climbedIds = useClimbedIds()

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
      if (unclimbedOnly && climbedIds.has(m.id)) continue
      const level = bestLevel(day.sights, sight)
      // 見どころで絞り込んだときは、その見どころが期待できる山だけにする
      if (sight !== 'all' && !isNotable(level)) continue
      if (day.weather === 'bad') {
        bad++
        if (!showBad) continue
      }
      result.push({ mountain: m, day, score: recommendScore(day.weather, level) })
    }
    // おすすめ度 → 名山 → 標高の順
    result.sort(
      (a, b) =>
        b.score - a.score ||
        (a.mountain.rank ?? 3) - (b.mountain.rank ?? 3) ||
        (b.mountain.ele ?? 0) - (a.mountain.ele ?? 0),
    )
    return { rows: result, badCount: bad }
  }, [mountains, recommendations, targetDate, pref, group, sight, showBad, unclimbedOnly, climbedIds])

  return (
    <section className="page recommend-page">
      <h1>おすすめ</h1>
      <div className="recommend-controls">
        <SightChips date={targetDate} value={sight} onChange={onSightChange} />
        <div className="search-filters">
          <DateSelect value={targetDate} onChange={onTargetDateChange} />
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
          <div className="check-row">
            <label className="check">
              <input type="checkbox" checked={unclimbedOnly} onChange={(e) => setUnclimbedOnly(e.target.checked)} />
              未登頂の山だけ
            </label>
            {badCount > 0 && (
              <label className="check">
                <input type="checkbox" checked={showBad} onChange={(e) => setShowBad(e.target.checked)} />
                天気が悪い山も表示する
              </label>
            )}
          </div>
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
                        {climbedIds.has(m.id) && <span className="badge badge-climbed">登頂済み</span>}
                      </span>
                      <span className="result-meta">
                        {m.pref}・{formatEle(m.ele)}
                      </span>
                    </span>
                    <span className="recommend-side">
                      <span>
                        {w?.icon} {WEATHER_CLASS_LABELS[day.weather]}
                      </span>
                      {rowSights(day, sight).map(([id, level]) => (
                        <SightTag key={id} id={id} level={level} />
                      ))}
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
