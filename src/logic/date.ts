// 日付はすべて日本時間の 'YYYY-MM-DD' で扱う（Open-Meteo の timezone=Asia/Tokyo と揃える）

const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

/** 日本時間での日付 */
export function toDateKey(date: Date): string {
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10)
}

export function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function weekdayOf(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay()
}

/** 今日以降で最初の土曜日（今日が土曜なら今日） */
export function nextSaturday(now = new Date()): string {
  const today = toDateKey(now)
  return addDays(today, (6 - weekdayOf(today) + 7) % 7)
}

/** 例: '10/24(土)' */
export function formatDateShort(dateKey: string): string {
  const [, m, d] = dateKey.split('-').map(Number)
  return `${m}/${d}(${WEEKDAYS[weekdayOf(dateKey)]})`
}
