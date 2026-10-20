import type { SightFilter } from '../logic/recommend'
import { decodeDay, type RecommendationsFile } from '../logic/recommendationsFile'
import { isNotable } from '../logic/sights'

export type { SightFilter } from '../logic/recommend'

export type MountainDisplayState = { dim: boolean; hl: boolean }

/**
 * 地図の点の見せ方を山ごとに決める。
 * - すべて：何もしない（全部ふつうに表示、輪なし）
 * - 晴れ：天気が良い山以外を薄く、天気が良い山に輪
 * - 見どころ：その見どころが期待できない山を薄く、見頃の山に輪
 */
export function displayStates(
  file: RecommendationsFile,
  date: string,
  filter: SightFilter,
): Map<string, MountainDisplayState> {
  const states = new Map<string, MountainDisplayState>()
  if (filter === 'all') return states
  for (const id of Object.keys(file.items)) {
    const day = decodeDay(file, id, date)
    if (!day) continue
    if (filter === 'sunny') {
      const good = day.weather === 'good'
      states.set(id, { dim: !good, hl: good })
    } else {
      const level = day.sights[filter] ?? 'none'
      states.set(id, { dim: !isNotable(level), hl: level === 'peak' })
    }
  }
  return states
}

let cached: Promise<RecommendationsFile | null> | null = null

/** 毎朝計算される主要な山のおすすめ度。まだ作られていない場合は null */
export function loadRecommendations(): Promise<RecommendationsFile | null> {
  cached ??= fetch(`${import.meta.env.BASE_URL}data/recommendations.json`)
    .then((res) => (res.ok ? (res.json() as Promise<RecommendationsFile>) : null))
    .catch(() => null)
  return cached
}
