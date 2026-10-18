// 季節の見どころの推定（要件定義 6章）。
// すべて気象データからの推定で、判定の数値は作りながら調整する。

import { addDays } from './date'
import { estimateKoyo, KOYO_LABELS, koyoDataStart, type KoyoStage } from './koyo'
import type { DailyTemp, DaySummary } from './weather'

export type SightId = 'koyo' | 'snow' | 'unkai' | 'muhyo' | 'shinryoku' | 'alpine'

/**
 * 見どころの状態。peak が「見頃・条件がそろう」で、おすすめの輪の対象。
 * starting は「始まりかけ」、chance は「可能性あり」、past は「過ぎた」、before は「まだ」、none は「期待できない」
 */
export type SightLevel = 'peak' | 'starting' | 'chance' | 'past' | 'before' | 'none'

export type SightResult = { id: SightId; level: SightLevel; label: string }

/** color は、その見どころを選んだときに見頃の山を囲む輪の色 */
type SightDef = { name: string; icon: string; months: number[]; color: string }

export const SIGHTS: Record<SightId, SightDef> = {
  koyo: { name: '紅葉', icon: '🍁', months: [9, 10, 11, 12], color: '#f08c00' },
  snow: { name: '雪山', icon: '🏔️', months: [10, 11, 12, 1, 2, 3, 4, 5], color: '#38bdf8' },
  unkai: { name: '雲海', icon: '☁️', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], color: '#64748b' },
  muhyo: { name: '霧氷', icon: '❄️', months: [10, 11, 12, 1, 2, 3, 4], color: '#7dd3fc' },
  shinryoku: { name: '新緑', icon: '🌱', months: [4, 5, 6], color: '#84cc16' },
  alpine: { name: '高山植物', icon: '🌼', months: [6, 7, 8], color: '#ec4899' },
}

export const SIGHT_IDS = Object.keys(SIGHTS) as SightId[]

/** 雲海を見られる山の高さ（m） */
const UNKAI_MIN_ELEVATION = 1000
/** 高山植物が咲く高さ（m） */
const ALPINE_MIN_ELEVATION = 1500
/** 雪山とみなす積雪（cm） */
const SNOW_MIN_CM = 10
/** 新緑・高山植物の推定で気温を見始める日（月日） */
const SPRING_DATA_START = '03-13'

const monthOf = (dateKey: string) => Number(dateKey.slice(5, 7))

export function isSightSeason(id: SightId, dateKey: string): boolean {
  return SIGHTS[id].months.includes(monthOf(dateKey))
}

/** その時期に当てはまる見どころ */
export function sightsInSeason(dateKey: string, elevation?: number): SightId[] {
  return SIGHT_IDS.filter((id) => {
    if (!isSightSeason(id, dateKey)) return false
    if (elevation !== undefined && id === 'unkai' && elevation < UNKAI_MIN_ELEVATION) return false
    if (elevation !== undefined && id === 'alpine' && elevation < ALPINE_MIN_ELEVATION) return false
    return true
  })
}

/** 見どころの推定に必要な過去の日数（紅葉は9月の少し前から、新緑・高山植物は3月中旬から） */
export function pastDaysNeeded(today: string): number {
  const year = today.slice(0, 4)
  const month = monthOf(today)
  let from: string | null = null
  if (isSightSeason('koyo', today)) from = koyoDataStart(year)
  else if (month >= 3 && month <= 8) from = `${year}-${SPRING_DATA_START}`
  if (!from) return 0
  const days = Math.round((Date.parse(today) - Date.parse(from)) / 86400000)
  // Open-Meteo で取れる過去の日数は最大 92 日
  return Math.min(92, Math.max(0, days))
}

const KOYO_LEVELS: Record<KoyoStage, SightLevel> = {
  off: 'none',
  before: 'before',
  starting: 'starting',
  peak: 'peak',
  past: 'past',
}

/**
 * 日平均気温が base℃ を（7日平均で）超えた日から何日たったか。まだなら null。
 * 新緑・高山植物に使う
 */
function daysSinceWarm(temps: DailyTemp[], targetDate: string, base: number): number | null {
  const from = `${targetDate.slice(0, 4)}-${SPRING_DATA_START}`
  const recent: number[] = []
  for (const { date, tmean } of temps) {
    if (date > targetDate) break
    if (date < from) continue
    recent.push(tmean)
    if (recent.length > 7) recent.shift()
    if (recent.length === 7 && recent.reduce((a, b) => a + b, 0) / 7 >= base) {
      return Math.round((Date.parse(targetDate) - Date.parse(addDays(date, -3))) / 86400000)
    }
  }
  return null
}

type Input = { day: DaySummary; temps: DailyTemp[]; elevation: number }

function judge(id: SightId, { day, temps, elevation }: Input): SightResult {
  const r = (level: SightLevel, label: string): SightResult => ({ id, level, label })
  switch (id) {
    case 'koyo': {
      const stage = estimateKoyo(temps, day.date).stage
      return r(KOYO_LEVELS[stage], KOYO_LABELS[stage])
    }
    case 'snow': {
      const cm = day.snowDepthCm
      if (cm === null || cm < SNOW_MIN_CM) return r('none', '積雪なし')
      // 晴れて雲が少なければ「雪山日和」
      if (day.cloudCoverAvg < 40) return r('peak', `雪山日和（積雪 約${cm}cm）`)
      return r('chance', `積雪 約${cm}cm`)
    }
    case 'unkai': {
      // 早朝に低い雲が多く、山頂の上（中・高い雲）が晴れていると雲海になりやすい。
      // ただし山頂の湿度が 100% 近いときは、山頂が雲の中にいる（霧）ので雲海は見えない
      const { dawnCloudLow: low, dawnCloudMid: mid, dawnCloudHigh: high, dawnPrecip, dawnHumidity } = day
      if (dawnHumidity >= 97) return r('none', '山頂が雲の中')
      if (low >= 60 && mid < 30 && high < 50 && dawnPrecip < 0.2 && dawnHumidity < 93) {
        return r('peak', '雲海の可能性が高い')
      }
      if (low >= 35 && mid < 50 && dawnPrecip < 0.5) return r('chance', '雲海の可能性あり')
      return r('none', '雲海は期待薄')
    }
    case 'muhyo': {
      // 氷点下で湿っていて、風が当たると霧氷ができやすい
      const { rimeMinTemp: t, rimeHumidity: rh, rimeWind: wind } = day
      if (t <= -5 && rh >= 90 && wind >= 3) return r('peak', '霧氷の可能性が高い')
      if (t <= -2 && rh >= 85) return r('chance', '霧氷の可能性あり')
      return r('none', '霧氷は期待薄')
    }
    case 'shinryoku': {
      const d = daysSinceWarm(temps, day.date, 10)
      if (d === null) return r('before', '芽吹き前')
      if (d < 5) return r('starting', '芽吹き始め')
      if (d <= 25) return r('peak', '新緑の見頃')
      return r('past', '新緑の時期は過ぎた')
    }
    case 'alpine': {
      if (elevation < ALPINE_MIN_ELEVATION) return r('none', '対象外の標高')
      const d = daysSinceWarm(temps, day.date, 5)
      if (d === null) return r('before', '咲く前')
      if (d < 14) return r('starting', '咲き始め')
      if (d <= 42) return r('peak', '見頃')
      return r('past', '終盤')
    }
  }
}

/** その日・その山の、時期に当てはまる見どころをすべて判定する */
export function evaluateSights(input: Input): SightResult[] {
  return sightsInSeason(input.day.date, input.elevation).map((id) => judge(id, input))
}

/** 見どころの点数。見頃が最も高い */
export function sightScore(level: SightLevel): number {
  switch (level) {
    case 'peak':
      return 5
    case 'chance':
      return 3
    case 'starting':
      return 2
    case 'past':
      return 1
    default:
      return 0
  }
}

/** 「見どころあり」として目立たせる状態（絞り込みで薄くしない） */
export function isNotable(level: SightLevel): boolean {
  return level === 'peak' || level === 'starting' || level === 'chance'
}

export function sightTitle(id: SightId): string {
  return `${SIGHTS[id].icon} ${SIGHTS[id].name}`
}

/** 一覧などに出す短い言葉（例：「雲海 可能性大」「紅葉 見頃」） */
export function levelLabel(id: SightId, level: SightLevel): string {
  if (id === 'koyo') {
    const stage: Record<SightLevel, KoyoStage> = {
      peak: 'peak',
      starting: 'starting',
      chance: 'starting',
      past: 'past',
      before: 'before',
      none: 'off',
    }
    return KOYO_LABELS[stage[level]]
  }
  const labels: Partial<Record<SightId, Partial<Record<SightLevel, string>>>> = {
    snow: { peak: '雪山日和', chance: '積雪あり', none: '積雪なし' },
    unkai: { peak: '可能性大', chance: '可能性あり', none: '期待薄' },
    muhyo: { peak: '可能性大', chance: '可能性あり', none: '期待薄' },
    shinryoku: { before: '芽吹き前', starting: '芽吹き始め', peak: '見頃', past: '過ぎた' },
    alpine: { before: '咲く前', starting: '咲き始め', peak: '見頃', past: '終盤' },
  }
  return labels[id]?.[level] ?? '—'
}
