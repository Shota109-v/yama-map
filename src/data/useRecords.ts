import { useMemo } from 'react'
import { db, type ClimbRecord, type Favorite } from './db'
import { useSafeLiveQuery } from './useSafeLiveQuery'

// 記録は多くても数百件なので、索引やカーソルを使わずに全件読んでから並べ替える
// （iPhone の WebKit で索引のカーソルが失敗することがあるため、単純な読み方にしている）

const EMPTY_RECORDS: ClimbRecord[] = []
const EMPTY_FAVORITES: Favorite[] = []

const byDateDesc = (a: ClimbRecord, b: ClimbRecord) => b.date.localeCompare(a.date)

/** すべての記録（新しい順） */
export function useAllRecords(): ClimbRecord[] {
  return useSafeLiveQuery(async () => (await db.records.toArray()).sort(byDateDesc), [], EMPTY_RECORDS)
}

/** この山の記録（新しい順） */
export function useMountainRecords(mountainId: string): ClimbRecord[] {
  const records = useAllRecords()
  return useMemo(() => records.filter((r) => r.mountainId === mountainId), [records, mountainId])
}

/** 登頂済みの山の id */
export function useClimbedIds(): Set<string> {
  const records = useAllRecords()
  return useMemo(() => new Set(records.map((r) => r.mountainId)), [records])
}

/** お気に入り（追加の新しい順） */
export function useFavorites(): Favorite[] {
  return useSafeLiveQuery(
    async () => (await db.favorites.toArray()).sort((a, b) => b.addedAt.localeCompare(a.addedAt)),
    [],
    EMPTY_FAVORITES,
  )
}
