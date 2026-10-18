// 登山記録・お気に入りの書き出し（JSON）と読み込み。
// ブラウザのデータは消えることがあるので、ときどき書き出して iCloud Drive などに保存してもらう

import { loadJson, saveJson } from '../lib/storage'
import { db, type ClimbRecord, type Favorite, type Photo } from './db'

const FORMAT = 'yama-map-backup'
const VERSION = 1
const LAST_EXPORT_KEY = 'yama-map:last-export'
/** 最後の書き出しからこの日数が過ぎたらお知らせする */
export const BACKUP_REMIND_DAYS = 30

type BackupPhoto = Omit<Photo, 'blob' | 'thumb'> & { blob: string; thumb: string }

type BackupFile = {
  format: typeof FORMAT
  version: number
  exportedAt: string
  records: ClimbRecord[]
  favorites: Favorite[]
  /** 写真を含めない書き出しでは空 */
  photos: BackupPhoto[]
}

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

const dataUrlToBlob = async (url: string) => (await fetch(url)).blob()

export async function exportBackup(includePhotos: boolean): Promise<{ blob: Blob; filename: string }> {
  const [records, favorites, photos] = await Promise.all([
    db.records.toArray(),
    db.favorites.toArray(),
    includePhotos ? db.photos.toArray() : Promise.resolve([] as Photo[]),
  ])
  const file: BackupFile = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    records,
    favorites,
    photos: await Promise.all(
      photos.map(async (p) => ({ ...p, blob: await blobToDataUrl(p.blob), thumb: await blobToDataUrl(p.thumb) })),
    ),
  }
  const date = file.exportedAt.slice(0, 10)
  return {
    blob: new Blob([JSON.stringify(file)], { type: 'application/json' }),
    filename: `yama-map-backup-${date}${includePhotos ? '' : '-nophoto'}.json`,
  }
}

export type ImportResult = { records: number; favorites: number; photos: number; skipped: number }

/** 読み込む。同じ id の記録は、更新日時が新しい方を残す */
export async function importBackup(file: File): Promise<ImportResult> {
  let data: BackupFile
  try {
    data = JSON.parse(await file.text())
  } catch {
    throw new Error('ファイルを読めませんでした（JSON ではありません）')
  }
  if (data.format !== FORMAT) throw new Error('このアプリの書き出しファイルではありません')

  const photos: Photo[] = await Promise.all(
    data.photos.map(async (p) => ({ ...p, blob: await dataUrlToBlob(p.blob), thumb: await dataUrlToBlob(p.thumb) })),
  )
  const result: ImportResult = { records: 0, favorites: 0, photos: 0, skipped: 0 }

  await db.transaction('rw', db.records, db.favorites, db.photos, async () => {
    for (const r of data.records) {
      const current = await db.records.get(r.id)
      if (current && current.updatedAt >= r.updatedAt) {
        result.skipped++
        continue
      }
      // 写真を含まない書き出しの場合は、手元にある写真の参照を残す
      const photoIds = photos.length ? r.photoIds : (current?.photoIds ?? [])
      await db.records.put({ ...r, photoIds })
      result.records++
    }
    for (const f of data.favorites) {
      if (await db.favorites.get(f.mountainId)) continue
      await db.favorites.put(f)
      result.favorites++
    }
    for (const p of photos) {
      if (await db.photos.get(p.id)) continue
      await db.photos.put(p)
      result.photos++
    }
  })
  return result
}

/** 書き出したファイルを保存できたときに呼ぶ */
export function markExported(): void {
  saveJson(LAST_EXPORT_KEY, { at: new Date().toISOString() })
}

export function lastExportAt(): string | null {
  return loadJson<{ at: string | null }>(LAST_EXPORT_KEY, { at: null }).at
}

/** 書き出しをお知らせすべきか（記録があり、しばらく書き出していない） */
export function backupIsDue(recordCount: number): boolean {
  if (recordCount === 0) return false
  const at = lastExportAt()
  if (!at) return true
  return Date.now() - Date.parse(at) > BACKUP_REMIND_DAYS * 86400000
}
