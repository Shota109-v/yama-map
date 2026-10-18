import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db, type ClimbRecord } from './db'

/** この山の記録（新しい順）。記録が変わると自動で更新される */
export function useMountainRecords(mountainId: string): ClimbRecord[] {
  return (
    useLiveQuery(
      async () => (await db.records.where('mountainId').equals(mountainId).sortBy('date')).reverse(),
      [mountainId],
    ) ?? []
  )
}

/** 登頂済みの山の id。記録が変わると自動で更新される */
export function useClimbedIds(): Set<string> {
  const ids = useLiveQuery(async () => (await db.records.orderBy('mountainId').uniqueKeys()) as string[], [])
  return useMemo(() => new Set(ids ?? []), [ids])
}
