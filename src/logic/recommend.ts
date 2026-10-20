// おすすめ度の判定（要件定義 5章）。
// 天気を最優先にし、悪天候の山は除外する。残りを天気の良さ → 見どころの順に並べる。

import { SIGHTS, sightScore, type SightId, type SightLevel } from './sights'
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

/** 地図・一覧の絞り込み。'all' はすべて、'sunny' は天気が良い山、それ以外は見どころ */
export type SightFilter = 'all' | 'sunny' | SightId

/** 「晴れ」の絞り込みの表示 */
export const SUNNY = { name: '晴れ', icon: '☀️', color: '#eab308' }

/** 絞り込み（すべて以外）の名前・記号・輪の色 */
export function filterInfo(filter: Exclude<SightFilter, 'all'>): { name: string; icon: string; color: string } {
  return filter === 'sunny' ? SUNNY : SIGHTS[filter]
}

/** 絞り込みに当てはまる見どころの状態のうち、最も良いもの（「すべて」「晴れ」ではすべての見どころから） */
export function bestLevel(
  sights: Partial<Record<SightId, SightLevel>>,
  filter: SightFilter,
): SightLevel {
  const levels = filter === 'all' || filter === 'sunny' ? Object.values(sights) : [sights[filter] ?? 'none']
  return levels.reduce<SightLevel>((best, l) => (sightScore(l) > sightScore(best) ? l : best), 'none')
}

const weatherBase = (cls: WeatherClass) => (cls === 'good' ? 20 : cls === 'fair' ? 10 : 0)

/** 見どころを選んだときのおすすめ度。天気が悪ければ 0。天気の良さ → その見どころの順 */
export function recommendScore(cls: WeatherClass, level: SightLevel): number {
  if (cls === 'bad') return 0
  return weatherBase(cls) + sightScore(level)
}

/**
 * 「すべて」「晴れ」のときのおすすめ度。特定の見どころに偏らないよう、
 * 天気 → 景色の良さ（雲の少なさ、0〜5点）→ 見どころ（どれかが見頃なら少しだけ、0〜2点）の順に効かせる。
 * cloudCover は登山時間帯の平均雲量（%）。分からなければ中間とみなす
 */
export function overallScore(
  cls: WeatherClass,
  cloudCover: number | null,
  sights: Partial<Record<SightId, SightLevel>>,
): number {
  const view = cloudCover === null ? 2.5 : (100 - cloudCover) / 20
  const best = bestLevel(sights, 'all')
  const bonus = best === 'peak' ? 2 : best === 'chance' || best === 'starting' ? 1 : 0
  return weatherBase(cls) + view + bonus
}

/**
 * 詳細パネルで「おすすめ」とするか。特定の見どころに偏らないよう、
 * 天気が良ければおすすめ、天気がまあまあでも何かの見どころが見頃ならおすすめ
 */
export function isHighlighted(cls: WeatherClass, level: SightLevel): boolean {
  return cls === 'good' || (cls === 'fair' && level === 'peak')
}
