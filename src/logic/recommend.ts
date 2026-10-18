// おすすめ度の判定（要件定義 5章）。
// 天気を最優先にし、悪天候の山は除外する。残りを天気の良さ → 見どころの順に並べる。

import type { KoyoStage } from './koyo'
import type { DaySummary } from './weather'

export type WeatherClass = 'good' | 'fair' | 'bad'

export const WEATHER_CLASS_LABELS: Record<WeatherClass, string> = {
  good: '天気が良い',
  fair: '天気はまあまあ',
  bad: '天気が悪い',
}

/** 除外する条件（初期値。作りながら調整する） */
const BAD = { precipHourlyMm: 1, precipProb: 50, wind: 15 }
/** 「天気が良い」とする条件 */
const GOOD = { cloudCover: 50, wind: 10 }

export type WeatherJudgement = { cls: WeatherClass; reasons: string[] }

export function judgeWeather(day: DaySummary): WeatherJudgement {
  const bad: string[] = []
  if (day.precipMaxHourly >= BAD.precipHourlyMm) bad.push('雨や雪（1時間1mm以上）')
  if ((day.precipProbMax ?? 0) >= BAD.precipProb) bad.push(`降水確率 ${day.precipProbMax}%`)
  if (day.windMax >= BAD.wind) bad.push(`強風（${Math.round(day.windMax)}m/s）`)
  if (day.thunder) bad.push('雷')
  if (bad.length) return { cls: 'bad', reasons: bad }

  const fair: string[] = []
  if (day.cloudCoverAvg >= GOOD.cloudCover) fair.push('雲が多い')
  if (day.windMax >= GOOD.wind) fair.push(`風がやや強い（${Math.round(day.windMax)}m/s）`)
  if (fair.length) return { cls: 'fair', reasons: fair }

  return { cls: 'good', reasons: ['晴れて風が弱い'] }
}

/** 見どころの点数。見頃が最も高い */
export function koyoScore(stage: KoyoStage, progress = 0): number {
  if (stage === 'peak') return 5
  if (stage === 'starting') return 1 + progress * 2
  if (stage === 'past') return 1
  return 0
}

/** おすすめ度。天気が悪ければ 0。天気の良さが見どころより常に優先される */
export function recommendScore(cls: WeatherClass, koyo: number): number {
  if (cls === 'bad') return 0
  return (cls === 'good' ? 20 : 10) + koyo
}

/** 地図で「おすすめ」として強調するか（天気が悪くなく、見どころが見頃） */
export function isHighlighted(cls: WeatherClass, stage: KoyoStage): boolean {
  return cls !== 'bad' && stage === 'peak'
}
