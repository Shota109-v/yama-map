import type { FeatureCollection, Point } from 'geojson'

export type MountainProps = {
  id: string
  name: string
  yomi?: string
  ele?: number
  pref: string
}

export type MountainCollection = FeatureCollection<Point, MountainProps>

export type Mountain = MountainProps & {
  lon: number
  lat: number
  /** 国土地理院「日本の主な山岳標高」に載っている山 */
  major: boolean
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
  return { ...props, lon: coordinates[0], lat: coordinates[1], major: props.id.startsWith('gsi-') }
}

export async function loadAllMountains(): Promise<Mountain[]> {
  const [major, other] = await Promise.all([loadMajorMountains(), loadOtherMountains()])
  return [...major.features, ...other.features].map((f) =>
    toMountain(f.properties, f.geometry.coordinates),
  )
}

export function formatEle(ele?: number) {
  return ele === undefined ? '標高不明' : `${ele.toLocaleString()}m`
}
