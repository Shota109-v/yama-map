import type { FeatureCollection, Point } from 'geojson'

/** 1 = 日本百名山、2 = 日本三百名山のうち百名山以外の200山 */
export type FamousRank = 1 | 2

export type MountainProps = {
  id: string
  name: string
  yomi?: string
  ele?: number
  pref: string
  rank?: FamousRank
}

export type MountainCollection = FeatureCollection<Point, MountainProps>

export type Mountain = MountainProps & {
  lon: number
  lat: number
  /** 地図に常に表示する山（国土地理院「日本の主な山岳標高」の山と、名山） */
  major: boolean
}

export const RANK_LABELS: Record<FamousRank, string> = {
  1: '百名山',
  2: '三百名山',
}

/** 名山なら「百名山」など、そうでなければ主要な山かどうかの表示 */
export function mountainBadge(m: Mountain): { label: string; className: string } | null {
  if (m.rank === 1) return { label: RANK_LABELS[1], className: 'badge badge-rank1' }
  if (m.rank === 2) return { label: RANK_LABELS[2], className: 'badge badge-rank2' }
  if (m.major) return { label: '主要', className: 'badge' }
  return null
}

const DATA_URL = `${import.meta.env.BASE_URL}data/`

const cache = new Map<string, Promise<MountainCollection>>()

function load(file: string): Promise<MountainCollection> {
  let p = cache.get(file)
  if (!p) {
    p = fetch(DATA_URL + file).then((res) => {
      if (!res.ok) throw new Error(`${file} の読み込みに失敗しました（${res.status}）`)
      return res.json()
    })
    // 失敗したときは次回やり直せるようにする
    p.catch(() => cache.delete(file))
    cache.set(file, p)
  }
  return p
}

/** 主要な約1,000山 */
export const loadMajorMountains = () => load('mountains-major.geojson')

/** その他の山（数万件） */
export const loadOtherMountains = () => load('mountains-other.geojson')

export function toMountain(props: MountainProps, coordinates: number[]): Mountain {
  return {
    ...props,
    lon: coordinates[0],
    lat: coordinates[1],
    major: props.id.startsWith('gsi-') || props.rank !== undefined,
  }
}

export async function loadAllMountains(): Promise<Mountain[]> {
  const [major, other] = await Promise.all([loadMajorMountains(), loadOtherMountains()])
  return [...major.features, ...other.features].map((f) =>
    toMountain(f.properties, f.geometry.coordinates),
  )
}

/** 「白山＜御前峰＞」「水晶岳（黒岳）」→「白山」「水晶岳」。検索では短い山名の方が多く見つかる */
export function searchName(name: string): string {
  return name.split(/[＜（(]/)[0].trim()
}

export function formatEle(ele?: number) {
  return ele === undefined ? '標高不明' : `${ele.toLocaleString()}m`
}
