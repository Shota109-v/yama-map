import { toDateKey } from '../logic/date'
import { buildOutlook, type DayOutlook } from '../logic/outlook'
import { pastDaysNeeded } from '../logic/sights'
import { fetchDailyTemps, fetchForecast, type DailyTemp, type ForecastPoint } from '../logic/weather'
import type { Mountain } from './mountains'

/** 紅葉を見る高さ（山頂からどれだけ下か、m） */
const KOYO_LEVEL_OFFSETS = [0, 500, 1000]
/** これより低い高さは紅葉の推定に使わない（m） */
const KOYO_MIN_ELEVATION = 300

export type KoyoLevel = { elevation: number | null; mins: DailyTemp[] }

export type MountainOutlook = {
  /** 予報を計算した標高（m） */
  elevation: number
  /** 山頂の7日間の見通し */
  days: DayOutlook[]
  /** 紅葉の推定に使う高さごとの最低気温（山頂から順）。シーズン外は空 */
  koyoLevels: KoyoLevel[]
}

/** 同じ山を何度も開いても取り直さない時間 */
const TTL_MS = 30 * 60 * 1000

const cache = new Map<string, { at: number; promise: Promise<MountainOutlook> }>()

export function getMountainOutlook(m: Mountain): Promise<MountainOutlook> {
  const hit = cache.get(m.id)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise

  const promise = load(m)
  promise.catch(() => cache.delete(m.id))
  cache.set(m.id, { at: Date.now(), promise })
  return promise
}

async function load(m: Mountain): Promise<MountainOutlook> {
  const pastDays = pastDaysNeeded(toDateKey(new Date()))
  const levels: ForecastPoint[] =
    m.ele === undefined
      ? [{ lat: m.lat, lon: m.lon }]
      : KOYO_LEVEL_OFFSETS.map((d) => m.ele! - d)
          .filter((e, i) => i === 0 || e >= KOYO_MIN_ELEVATION)
          .map((elevation) => ({ lat: m.lat, lon: m.lon, elevation }))

  const [forecast, mins] = await Promise.all([
    fetchForecast({ lat: m.lat, lon: m.lon, elevation: m.ele }),
    pastDays > 0 ? fetchDailyTemps(levels, pastDays) : Promise.resolve([] as DailyTemp[][]),
  ])

  return {
    elevation: forecast.elevation,
    days: buildOutlook(forecast, mins[0] ?? []),
    koyoLevels: mins.map((ms, i) => ({ elevation: levels[i].elevation ?? null, mins: ms })),
  }
}
