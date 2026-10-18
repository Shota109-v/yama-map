// 登山記録・お気に入りの読み書き

import { db, type ClimbRecord, type MountainRef, type ObservedKoyo, type Photo } from './db'

/** 写真は長辺をこの大きさまで縮めて保存する（容量の節約） */
const PHOTO_MAX = 1600
const THUMB_MAX = 320
const JPEG_QUALITY = 0.82

async function resizeImage(file: Blob, max: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('写真を変換できませんでした'))), 'image/jpeg', JPEG_QUALITY),
  )
}

export async function photoFromFile(file: File, recordId: string): Promise<Photo> {
  const [blob, thumb] = await Promise.all([resizeImage(file, PHOTO_MAX), resizeImage(file, THUMB_MAX)])
  return { id: crypto.randomUUID(), recordId, blob, thumb }
}

export type RecordDraft = {
  id?: string
  mountain: MountainRef
  date: string
  memo: string
  koyo: ObservedKoyo | null
  /** 残す写真（既存）の id */
  keepPhotoIds: string[]
  /** 新しく追加する写真 */
  newPhotos: File[]
}

export async function saveRecord(draft: RecordDraft): Promise<string> {
  const id = draft.id ?? crypto.randomUUID()
  const now = new Date().toISOString()
  const added = await Promise.all(draft.newPhotos.map((f) => photoFromFile(f, id)))

  await db.transaction('rw', db.records, db.photos, async () => {
    const existing = draft.id ? await db.records.get(draft.id) : undefined
    const removed = (existing?.photoIds ?? []).filter((p) => !draft.keepPhotoIds.includes(p))
    if (removed.length) await db.photos.bulkDelete(removed)
    if (added.length) await db.photos.bulkAdd(added)
    const record: ClimbRecord = {
      id,
      mountainId: draft.mountain.id,
      mountain: draft.mountain,
      date: draft.date,
      memo: draft.memo,
      koyo: draft.koyo,
      photoIds: [...draft.keepPhotoIds, ...added.map((p) => p.id)],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await db.records.put(record)
  })
  return id
}

export async function deleteRecord(id: string): Promise<void> {
  await db.transaction('rw', db.records, db.photos, async () => {
    // 索引のカーソルを使わず、記録が持っている写真の id で消す（iPhone の WebKit 対策）
    const record = await db.records.get(id)
    if (record?.photoIds.length) await db.photos.bulkDelete(record.photoIds)
    await db.records.delete(id)
  })
}

export async function toggleFavorite(mountain: MountainRef): Promise<boolean> {
  const existing = await db.favorites.get(mountain.id)
  if (existing) {
    await db.favorites.delete(mountain.id)
    return false
  }
  await db.favorites.put({ mountainId: mountain.id, mountain, addedAt: new Date().toISOString() })
  return true
}
