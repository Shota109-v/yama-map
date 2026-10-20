// 山へのアクセス（登山口・最寄り駅・駐車場）。scripts/build_access.py が作る public/data/access.json を読む

type RawTrailhead = [string, number, number, number, string, string, number, number, number]
type RawStation = [string, string, number, number, number]
type RawParking = [string, number, number, number, string, string]
type RawAccess = { t?: RawTrailhead[]; s?: RawStation[]; p?: RawParking[] }

export type Station = { name: string; operator: string; lat: number; lon: number; km: number }
export type Trailhead = { name: string; lat: number; lon: number; kmFromSummit: number; station: Station | null }
export type Parking = { name: string; lat: number; lon: number; km: number; capacity: string; fee: string }

export type MountainAccess = {
  /** 登録されている登山口（山頂から近い順） */
  trailheads: Trailhead[]
  /** 登山口がないときの、山頂からの最寄り駅 */
  stations: Station[]
  /** 駐車場（登山口の近く、なければ山頂の近く） */
  parkings: Parking[]
}

let cached: Promise<Record<string, RawAccess> | null> | null = null

function loadAll() {
  cached ??= fetch(`${import.meta.env.BASE_URL}data/access.json`)
    .then((res) => (res.ok ? (res.json() as Promise<Record<string, RawAccess>>) : null))
    .catch(() => null)
  return cached
}

/** 主要な山のアクセス情報。データがない山は null */
export async function loadAccess(mountainId: string): Promise<MountainAccess | null> {
  const raw = (await loadAll())?.[mountainId]
  if (!raw) return null
  return {
    trailheads: (raw.t ?? []).map(([name, lat, lon, kmFromSummit, sName, sOp, sLat, sLon, sKm]) => ({
      name,
      lat,
      lon,
      kmFromSummit,
      station: sName ? { name: sName, operator: sOp, lat: sLat, lon: sLon, km: sKm } : null,
    })),
    stations: (raw.s ?? []).map(([name, operator, lat, lon, km]) => ({ name, operator, lat, lon, km })),
    parkings: (raw.p ?? []).map(([name, lat, lon, km, capacity, fee]) => ({ name, lat, lon, km, capacity, fee })),
  }
}
