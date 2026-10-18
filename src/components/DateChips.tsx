import { useState } from 'react'
import { addDays, toDateKey, weekdayOf } from '../logic/date'
import { FORECAST_DAYS } from '../logic/weather'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

type Props = { value: string; onChange: (date: string) => void }

/** 今日から7日先までの日付を選ぶ */
export function DateChips({ value, onChange }: Props) {
  const [today] = useState(() => toDateKey(new Date()))
  const dates = Array.from({ length: FORECAST_DAYS }, (_, i) => addDays(today, i))

  return (
    <div className="chips" role="tablist" aria-label="日付">
      {dates.map((d, i) => {
        const w = weekdayOf(d)
        const label = i === 0 ? '今日' : i === 1 ? '明日' : `${Number(d.slice(8))}日`
        return (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={d === value}
            className={`chip${w === 0 ? ' chip-sun' : w === 6 ? ' chip-sat' : ''}`}
            onClick={() => onChange(d)}
          >
            {label}
            <span className="chip-sub">{WEEKDAYS[w]}</span>
          </button>
        )
      })}
    </div>
  )
}
