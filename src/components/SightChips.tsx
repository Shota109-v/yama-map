import type { SightFilter } from '../data/recommendations'
import { SUNNY } from '../logic/recommend'
import { sightsInSeason, sightTitle } from '../logic/sights'

type Props = { date: string; value: SightFilter; onChange: (v: SightFilter) => void }

/** 絞り込み。晴れ（最初に選ばれている）、選んだ日の時期に当てはまる見どころ、すべて（いちばん右）の順に出す */
export function SightChips({ date, value, onChange }: Props) {
  const options: { value: SightFilter; label: string }[] = [
    { value: 'sunny', label: `${SUNNY.icon} ${SUNNY.name}` },
    ...sightsInSeason(date).map((id) => ({ value: id, label: sightTitle(id) })),
    { value: 'all', label: 'すべて' },
  ]

  return (
    <div className="chips" role="tablist" aria-label="絞り込み">
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
