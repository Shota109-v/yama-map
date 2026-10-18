// 端末の中に保存するデータ（登山記録・お気に入り・写真）。IndexedDB を Dexie で扱う

import { Dexie, type EntityTable } from 'dexie'
import type { KoyoStage } from '../logic/koyo'
import type { FamousRank, Mountain } from './mountains'

/** 記録やお気に入りに残す山の情報（山のデータが更新されても表示できるよう写しを持つ） */
export type MountainRef = {
  id: string
  name: string
  pref: string
  ele?: number
  rank?: FamousRank
  lat: number
  lon: number
}

/** 実際に見た紅葉の様子（推定の精度確認にも使う） */
export type ObservedKoyo = Exclude<KoyoStage, 'off'>

export type ClimbRecord = {
  /** 端末をまたいで読み込んでも重ならないよう UUID にする */
  id: string
  mountainId: string
  mountain: MountainRef
  /** 登った日（YYYY-MM-DD） */
  date: string
  memo: string
  koyo: ObservedKoyo | null
  photoIds: string[]
  createdAt: string
  updatedAt: string
}

export type Photo = {
  id: string
  recordId: string
  /** 長辺 1600px 程度に縮めた写真 */
  blob: Blob
  /** 一覧用の小さな写真 */
  thumb: Blob
}

export type Favorite = {
  mountainId: string
  mountain: MountainRef
  addedAt: string
}

class YamaMapDB extends Dexie {
  records!: EntityTable<ClimbRecord, 'id'>
  photos!: EntityTable<Photo, 'id'>
  favorites!: EntityTable<Favorite, 'mountainId'>

  constructor() {
    super('yama-map')
    this.version(1).stores({
      records: 'id, mountainId, date',
      photos: 'id, recordId',
      favorites: 'mountainId, addedAt',
    })
  }
}

export const db = new YamaMapDB()

export function toMountainRef(m: Mountain): MountainRef {
  return { id: m.id, name: m.name, pref: m.pref, ele: m.ele, rank: m.rank, lat: m.lat, lon: m.lon }
}

export function refToMountain(r: MountainRef): Mountain {
  return { ...r, major: r.id.startsWith('gsi-') || r.rank !== undefined }
}

/**
 * ブラウザに「このデータは消さないで」と頼む。
 * ホーム画面に追加した PWA では通常認められ、容量不足などで自動削除されにくくなる
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}
