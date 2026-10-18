// 紅葉の進み具合の推定。
// 最低気温が 8℃ を下回ると色づき始め、さらに冷え込むほど進むという目安を、
// 「8℃ からどれだけ下回ったか」の積算（以下、冷え込み量）で表す。
// 判定の数値は作りながら調整する（要件定義 6章）。

import { addDays } from './date'

export type KoyoStage = 'off' | 'before' | 'starting' | 'peak' | 'past'

export const KOYO_LABELS: Record<KoyoStage, string> = {
  off: 'シーズン外',
  before: '色づき前',
  starting: '色づき始め',
  peak: '見頃',
  past: '見頃過ぎ',
}

/** この気温（℃）を下回ると色づき始める */
const BASE_TEMP = 8
/** 色づき始めの判定に使う、最低気温の移動平均の日数 */
const START_WINDOW_DAYS = 7
/** 冷え込み量がこれを超えたら見頃 */
const PEAK_CHILL = 50
/** 冷え込み量がこれを超えたら見頃過ぎ */
const PAST_CHILL = 140
/** 紅葉の推定をする時期（月）。この前の月末から気温を見る */
const SEASON_FIRST_MONTH = 9
const SEASON_LAST_MONTH = 12

export type DailyMin = { date: string; tmin: number }

export type KoyoEstimate = {
  stage: KoyoStage
  /** 色づき始めた日（推定）。まだなら null */
  startDate: string | null
  /** 冷え込み量 */
  chill: number
  /** 色づき始め〜見頃過ぎの間のどこにいるか（0〜1） */
  progress: number
}

export function isKoyoSeason(dateKey: string): boolean {
  const month = Number(dateKey.slice(5, 7))
  return month >= SEASON_FIRST_MONTH && month <= SEASON_LAST_MONTH
}

/** 紅葉の推定に必要な過去の日数（今日から数えて、9月の少し前まで） */
export function koyoPastDaysNeeded(today: string): number {
  if (!isKoyoSeason(today)) return 0
  const seasonStart = `${today.slice(0, 4)}-0${SEASON_FIRST_MONTH}-01`
  const from = addDays(seasonStart, -START_WINDOW_DAYS)
  const days = Math.round((Date.parse(today) - Date.parse(from)) / 86400000)
  // Open-Meteo で取れる過去の日数は最大 92 日
  return Math.min(92, Math.max(0, days))
}

/** targetDate 時点の紅葉の状態を推定する。mins は日付順で、targetDate までを含むこと */
export function estimateKoyo(mins: DailyMin[], targetDate: string): KoyoEstimate {
  if (!isKoyoSeason(targetDate)) return { stage: 'off', startDate: null, chill: 0, progress: 0 }

  const seasonStart = `${targetDate.slice(0, 4)}-0${SEASON_FIRST_MONTH}-01`
  let startDate: string | null = null
  let chill = 0
  const recent: number[] = []

  for (const { date, tmin } of mins) {
    if (date > targetDate) break
    recent.push(tmin)
    if (recent.length > START_WINDOW_DAYS) recent.shift()
    if (date < seasonStart) continue

    if (!startDate && recent.length === START_WINDOW_DAYS) {
      const avg = recent.reduce((a, b) => a + b, 0) / recent.length
      if (avg <= BASE_TEMP) startDate = date
    }
    if (startDate) chill += Math.max(0, BASE_TEMP - tmin)
  }

  const progress = Math.min(1, chill / PAST_CHILL)
  let stage: KoyoStage = 'before'
  if (startDate) stage = chill >= PAST_CHILL ? 'past' : chill >= PEAK_CHILL ? 'peak' : 'starting'
  return { stage, startDate, chill: Math.round(chill), progress }
}
