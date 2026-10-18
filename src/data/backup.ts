// 登山記録・お気に入りの書き出し（JSON）と読み込み。
// ブラウザのデータは消えることがあるので、ときどき書き出して iCloud Drive などに保存してもらう

import { loadJson, saveJson } from '../lib/storage'
import { db, type ClimbRecord, type Favorite, type MountainRef, type Photo } from './db'

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

export type ImportResult = {
  records: number
  favorites: number
  photos: number
  /** 手元の方が新しかった記録 */
  skipped: number
  /** 形がおかしくて読み飛ばしたもの */
  invalid: number
}

// ---------- 読み込むファイルの中身の確認 ----------
// 壊れたファイルや細工されたファイルを読み込んでも、おかしなデータが入らないようにする

const MAX_FILE_BYTES = 500 * 1024 * 1024
const MAX_TEXT = 20_000
const KOYO_VALUES = ['before', 'starting', 'peak', 'past']

const isStr = (v: unknown, max = 200): v is string => typeof v === 'string' && v.length <= max
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isDateKey = (v: unknown) => isStr(v, 10) && /^\d{4}-\d{2}-\d{2}$/.test(v)

function isMountainRef(v: unknown): v is MountainRef {
  const m = v as MountainRef
  return (
    !!m &&
    isStr(m.id) &&
    isStr(m.name) &&
    isStr(m.pref) &&
    isNum(m.lat) &&
    isNum(m.lon) &&
    (m.ele === undefined || isNum(m.ele)) &&
    (m.rank === undefined || m.rank === 1 || m.rank === 2)
  )
}

function isRecord(v: unknown): v is ClimbRecord {
  const r = v as ClimbRecord
  return (
    !!r &&
    isStr(r.id) &&
    isStr(r.mountainId) &&
    isMountainRef(r.mountain) &&
    r.mountain.id === r.mountainId &&
    isDateKey(r.date) &&
    isStr(r.memo, MAX_TEXT) &&
    (r.koyo === null || KOYO_VALUES.includes(r.koyo)) &&
    Array.isArray(r.photoIds) &&
    r.photoIds.every((p) => isStr(p)) &&
    isStr(r.createdAt) &&
    isStr(r.updatedAt)
  )
}

function isFavorite(v: unknown): v is Favorite {
  const f = v as Favorite
  return !!f && isStr(f.mountainId) && isMountainRef(f.mountain) && isStr(f.addedAt)
}

/** 写真は埋め込まれた画像（data:image/…）だけを受け付ける。他の URL だと外部に読みに行ってしまうため */
const isImageDataUrl = (v: unknown): v is string => typeof v === 'string' && v.startsWith('data:image/')

function isBackupPhoto(v: unknown): v is BackupPhoto {
  const p = v as BackupPhoto
  return !!p && isStr(p.id) && isStr(p.recordId) && isImageDataUrl(p.blob) && isImageDataUrl(p.thumb)
}

/** 読み込む。同じ id の記録は、更新日時が新しい方を残す。形のおかしいデータは読み飛ばす */
export async function importBackup(file: File): Promise<ImportResult> {
  if (file.size > MAX_FILE_BYTES) throw new Error('ファイルが大きすぎます')
  let data: BackupFile
  try {
    data = JSON.parse(await file.text())
  } catch {
    throw new Error('ファイルを読めませんでした（JSON ではありません）')
  }
  if (!data || data.format !== FORMAT) throw new Error('このアプリの書き出しファイルではありません')

  const list = (v: unknown) => (Array.isArray(v) ? v : [])
  const records = list(data.records).filter(isRecord)
  const favorites = list(data.favorites).filter(isFavorite)
  const backupPhotos = list(data.photos).filter(isBackupPhoto)
  const invalid =
    list(data.records).length - records.length +
    list(data.favorites).length - favorites.length +
    list(data.photos).length - backupPhotos.length

  const photos: Photo[] = await Promise.all(
    backupPhotos.map(async (p) => ({
      id: p.id,
      recordId: p.recordId,
      blob: await dataUrlToBlob(p.blob),
      thumb: await dataUrlToBlob(p.thumb),
    })),
  )
  const result: ImportResult = { records: 0, favorites: 0, photos: 0, skipped: 0, invalid }

  await db.transaction('rw', db.records, db.favorites, db.photos, async () => {
    for (const r of records) {
      const current = await db.records.get(r.id)
      if (current && current.updatedAt >= r.updatedAt) {
        result.skipped++
        continue
      }
      // 写真を含まない書き出しの場合は、手元にある写真の参照を残す
      const photoIds = photos.length ? r.photoIds : (current?.photoIds ?? [])
      // 決まった項目だけを保存する（ファイルに余計な項目があっても持ち込まない）
      await db.records.put({
        id: r.id,
        mountainId: r.mountainId,
        mountain: pickMountain(r.mountain),
        date: r.date,
        memo: r.memo,
        koyo: r.koyo,
        photoIds,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })
      result.records++
    }
    for (const f of favorites) {
      if (await db.favorites.get(f.mountainId)) continue
      await db.favorites.put({ mountainId: f.mountainId, mountain: pickMountain(f.mountain), addedAt: f.addedAt })
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

function pickMountain(m: MountainRef): MountainRef {
  return { id: m.id, name: m.name, pref: m.pref, ele: m.ele, rank: m.rank, lat: m.lat, lon: m.lon }
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
