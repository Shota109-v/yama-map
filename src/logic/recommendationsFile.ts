// 主要な山のおすすめ度をまとめたファイル（public/data/recommendations.json）の形式。
// 定期計算（scripts/build-recommendations.ts）が書き、アプリが読む。
// 1,000山以上あるので、日ごとの値は1文字ずつの文字列に詰めて小さくする

import type { KoyoStage } from './koyo'
import type { WeatherClass } from './recommend'

export type RecommendationsFile = {
  generatedAt: string
  /** 予報の日付（7日分） */
  dates: string[]
  /** 山の id ごとの値。w・k は dates と同じ順に1文字ずつ、s はおすすめ度、c は天気コード */
  items: Record<string, { w: string; k: string; s: number[]; c: number[] }>
}

const WEATHER_CODES: Record<WeatherClass, string> = { good: 'g', fair: 'f', bad: 'b' }
const KOYO_CODES: Record<KoyoStage, string> = { off: 'o', before: 'b', starting: 's', peak: 'p', past: 'x' }

const invert = <K extends string>(m: Record<K, string>) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k])) as Record<string, K>
const WEATHER_BY_CODE = invert(WEATHER_CODES)
const KOYO_BY_CODE = invert(KOYO_CODES)

export const encodeWeather = (cls: WeatherClass) => WEATHER_CODES[cls]
export const encodeKoyo = (stage: KoyoStage) => KOYO_CODES[stage]

export type DayRecommendation = {
  weather: WeatherClass
  koyo: KoyoStage
  score: number
  weatherCode: number | null
}

export function decodeDay(
  file: RecommendationsFile,
  id: string,
  date: string,
): DayRecommendation | null {
  const i = file.dates.indexOf(date)
  const item = file.items[id]
  if (i < 0 || !item) return null
  return {
    weather: WEATHER_BY_CODE[item.w[i]] ?? 'fair',
    koyo: KOYO_BY_CODE[item.k[i]] ?? 'off',
    score: item.s[i] ?? 0,
    weatherCode: item.c?.[i] ?? null,
  }
}
