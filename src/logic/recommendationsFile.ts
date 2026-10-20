// 主要な山のおすすめ度をまとめたファイル（public/data/recommendations.json）の形式。
// 定期計算（scripts/build-recommendations.ts）が書き、アプリが読む。
// 1,000山以上あるので、日ごとの値は1文字ずつの文字列に詰めて小さくする

import type { WeatherClass } from './recommend'
import type { SightId, SightLevel } from './sights'

export type RecommendationsFile = {
  generatedAt: string
  /** 予報の日付（7日分） */
  dates: string[]
  /**
   * 山の id ごとの値（どれも dates と同じ順）。
   * w：天気（1日1文字）、c：天気コード、g：見どころごとの状態（1日1文字）
   */
  items: Record<
    string,
    {
      w: string
      c: number[]
      /** 登山時間帯の平均雲量を10%きざみの1文字（0〜9）にしたもの。古いファイルにはない */
      v?: string
      g?: Partial<Record<SightId, string>>
      /** 古い形式（紅葉だけ）。g がないときに使う */
      k?: string
    }
  >
}

const WEATHER_CODES: Record<WeatherClass, string> = { good: 'g', fair: 'f', bad: 'b' }
const LEVEL_CODES: Record<SightLevel, string> = {
  peak: 'p',
  starting: 's',
  chance: 'c',
  past: 'x',
  before: 'b',
  none: '-',
}
/** 古い形式の紅葉の文字（o はシーズン外） */
const OLD_KOYO: Record<string, SightLevel> = { o: 'none', b: 'before', s: 'starting', p: 'peak', x: 'past' }

const invert = <K extends string>(m: Record<K, string>) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k])) as Record<string, K>
const WEATHER_BY_CODE = invert(WEATHER_CODES)
const LEVEL_BY_CODE = invert(LEVEL_CODES)

export const encodeWeather = (cls: WeatherClass) => WEATHER_CODES[cls]
export const encodeLevel = (level: SightLevel) => LEVEL_CODES[level]
/** 雲量（%）を 0〜9 の1文字に */
export const encodeCloud = (percent: number) => String(Math.min(9, Math.max(0, Math.floor(percent / 10))))

export type DayRecommendation = {
  weather: WeatherClass
  weatherCode: number | null
  /** 登山時間帯の平均雲量（%、10%きざみの中央値）。データがなければ null */
  cloudCover: number | null
  /** その日に時期の当てはまる見どころの状態 */
  sights: Partial<Record<SightId, SightLevel>>
}

export function decodeDay(file: RecommendationsFile, id: string, date: string): DayRecommendation | null {
  const i = file.dates.indexOf(date)
  const item = file.items[id]
  if (i < 0 || !item) return null

  const sights: Partial<Record<SightId, SightLevel>> = {}
  if (item.g) {
    for (const [sight, codes] of Object.entries(item.g) as [SightId, string][]) {
      const level = LEVEL_BY_CODE[codes[i]]
      if (level) sights[sight] = level
    }
  } else if (item.k) {
    const level = OLD_KOYO[item.k[i]]
    if (level && level !== 'none') sights.koyo = level
  }

  return {
    weather: WEATHER_BY_CODE[item.w[i]] ?? 'fair',
    weatherCode: item.c?.[i] ?? null,
    cloudCover: item.v && /\d/.test(item.v[i] ?? '') ? Number(item.v[i]) * 10 + 5 : null,
    sights,
  }
}
