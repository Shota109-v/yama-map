import { fetchForecast, summarizeDays, type DaySummary } from '../logic/weather'
import type { Mountain } from './mountains'

export type MountainForecast = { elevation: number; days: DaySummary[]; fetchedAt: number }

/** 同じ山を何度も開いても取り直さない時間 */
const TTL_MS = 30 * 60 * 1000

const cache = new Map<string, Promise<MountainForecast>>()
const fetchedAt = new Map<string, number>()

export function getMountainForecast(m: Mountain): Promise<MountainForecast> {
  const hit = cache.get(m.id)
  if (hit && Date.now() - (fetchedAt.get(m.id) ?? 0) < TTL_MS) return hit

  const p = fetchForecast(m.lat, m.lon, m.ele).then((f) => ({
    elevation: f.elevation,
    days: summarizeDays(f),
    fetchedAt: Date.now(),
  }))
  p.catch(() => cache.delete(m.id))
  cache.set(m.id, p)
  fetchedAt.set(m.id, Date.now())
  return p
}
