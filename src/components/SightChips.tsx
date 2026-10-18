import type { SightFilter } from '../data/recommendations'
import { isKoyoSeason } from '../logic/koyo'

type Props = { date: string; value: SightFilter; onChange: (v: SightFilter) => void }

/** 見どころの絞り込み。今の時期に当てはまる見どころだけを出す（ステップ6で種類を増やす） */
export function SightChips({ date, value, onChange }: Props) {
  const options: { value: SightFilter; label: string }[] = [{ value: 'all', label: 'すべて' }]
  if (isKoyoSeason(date)) options.push({ value: 'koyo', label: '🍁 紅葉' })
  if (options.length < 2) return null

  return (
    <div className="chips" role="tablist" aria-label="見どころ">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className="chip"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
