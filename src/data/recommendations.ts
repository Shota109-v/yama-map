import { isHighlighted } from '../logic/recommend'
import { decodeDay, type RecommendationsFile } from '../logic/recommendationsFile'

/** 見どころの絞り込み。'all' はすべて、'koyo' は紅葉が色づいている山だけを目立たせる */
export type SightFilter = 'all' | 'koyo'

export type MountainDisplayState = { dim: boolean; hl: boolean }

/** 地図の点の見せ方を山ごとに決める（天気が悪い・絞り込みに合わない山は薄く、おすすめは輪付き） */
export function displayStates(
  file: RecommendationsFile,
  date: string,
  sight: SightFilter,
): Map<string, MountainDisplayState> {
  const states = new Map<string, MountainDisplayState>()
  for (const id of Object.keys(file.items)) {
    const day = decodeDay(file, id, date)
    if (!day) continue
    const koyoMatch = day.koyo === 'starting' || day.koyo === 'peak'
    states.set(id, {
      dim: day.weather === 'bad' || (sight === 'koyo' && !koyoMatch),
      hl: isHighlighted(day.weather, day.koyo),
    })
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
