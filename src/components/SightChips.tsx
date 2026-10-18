import type { SightFilter } from '../data/recommendations'
import { sightsInSeason, sightTitle } from '../logic/sights'

type Props = { date: string; value: SightFilter; onChange: (v: SightFilter) => void }

/** 見どころの絞り込み。選んだ日の時期に当てはまる見どころだけを出す */
export function SightChips({ date, value, onChange }: Props) {
  const options: { value: SightFilter; label: string }[] = [
    { value: 'all', label: 'すべて' },
    ...sightsInSeason(date).map((id) => ({ value: id, label: sightTitle(id) })),
  ]

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
