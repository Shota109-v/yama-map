import { useState } from 'react'
import { addDays, formatDateShort, toDateKey } from '../logic/date'
import { FORECAST_DAYS } from '../logic/weather'

type Props = { value: string; onChange: (date: string) => void; className?: string }

/** 今日から7日先までの日付を選ぶプルダウン */
export function DateSelect({ value, onChange, className }: Props) {
  const [today] = useState(() => toDateKey(new Date()))
  const dates = Array.from({ length: FORECAST_DAYS }, (_, i) => addDays(today, i))

  return (
    <select
      className={`date-select${className ? ` ${className}` : ''}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="日付"
    >
      {dates.map((d, i) => (
        <option key={d} value={d}>
          {i === 0 ? '今日 ' : i === 1 ? '明日 ' : ''}
          {formatDateShort(d)}
        </option>
      ))}
    </select>
  )
}
