import type {
  ExpressionSpecification,
  FilterSpecification,
  GeoJSONSource,
  Map as MapLibreMap,
} from 'maplibre-gl'
import { loadMajorMountains, loadOtherMountains } from '../data/mountains'

export const MAJOR_SOURCE = 'mountains-major'
export const OTHER_SOURCE = 'mountains-other'
export const MAJOR_POINT_LAYER = 'mountains-major-point'
export const OTHER_POINT_LAYER = 'mountains-other-point'
export const SELECTED_LAYER = 'mountain-selected'

/** その他の山を表示し始める縮尺 */
export const OTHER_MIN_ZOOM = 9

const EMPTY = { type: 'FeatureCollection' as const, features: [] }

const LABEL_FONT = ['Open Sans Semibold']

export async function addMountainLayers(map: MapLibreMap) {
  map.addSource(MAJOR_SOURCE, { type: 'geojson', data: EMPTY })
  map.addSource(OTHER_SOURCE, { type: 'geojson', data: EMPTY })
  map.addSource(SELECTED_LAYER, { type: 'geojson', data: EMPTY })

  // その他の山：拡大したときだけ灰色の小さな点で表示する
  map.addLayer({
    id: OTHER_POINT_LAYER,
    type: 'circle',
    source: OTHER_SOURCE,
    minzoom: OTHER_MIN_ZOOM,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3.5, 14, 6],
      'circle-color': '#6b7570',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1,
    },
  })
  map.addLayer({
    id: 'mountains-other-label',
    type: 'symbol',
    source: OTHER_SOURCE,
    minzoom: 12,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': LABEL_FONT,
      'text-size': 11,
      'text-offset': [0, 0.9],
      'text-anchor': 'top',
      'text-optional': true,
    },
    paint: { 'text-color': '#4a524e', 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 },
  })

  // 主要な山：常に表示する。ステップ4でおすすめ度による色分けに置き換える
  map.addLayer({
    id: MAJOR_POINT_LAYER,
    type: 'circle',
    source: MAJOR_SOURCE,
    layout: {
      // 百名山 → 二百・三百名山 → その他の順に上に重ねる
      'circle-sort-key': ['-', 3, ['coalesce', ['get', 'rank'], 3]],
    },
    paint: {
      // 名山は大きさと縁取りで見分ける（中の色はステップ4でおすすめ度に使う）
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        4,
        byRank(4.5, 3.5, 2.5),
        8,
        byRank(8, 6.5, 5),
        13,
        byRank(11, 9, 7.5),
      ],
      'circle-color': '#1f5f4a',
      'circle-stroke-color': byRank(RANK1_STROKE, RANK2_STROKE, '#ffffff'),
      'circle-stroke-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        4,
        byRank(2, 1.5, 1),
        10,
        byRank(3.5, 3, 2),
      ],
    },
  })
  // 名山の名前は広域から、その他の主要な山は拡大してから表示する
  addMajorLabelLayer(map, 'mountains-famous-label', ['has', 'rank'], 6)
  addMajorLabelLayer(map, 'mountains-major-label', ['!', ['has', 'rank']], 8)

  // 選んだ山の強調表示
  map.addLayer({
    id: SELECTED_LAYER,
    type: 'circle',
    source: SELECTED_LAYER,
    paint: {
      'circle-radius': 14,
      'circle-color': 'rgba(232, 137, 58, 0.25)',
      'circle-stroke-color': '#e8893a',
      'circle-stroke-width': 2.5,
    },
  })

  const major = await loadMajorMountains()
  ;(map.getSource(MAJOR_SOURCE) as GeoJSONSource).setData(major)

  // その他の山は数が多いので、初めて拡大したときに読み込む
  const loadOthersIfNeeded = async () => {
    if (map.getZoom() < OTHER_MIN_ZOOM - 1) return
    map.off('moveend', loadOthersIfNeeded)
    const other = await loadOtherMountains()
    ;(map.getSource(OTHER_SOURCE) as GeoJSONSource).setData(other)
  }
  map.on('moveend', loadOthersIfNeeded)
  loadOthersIfNeeded()
}

const RANK1_STROKE = '#d4a017' // 金
const RANK2_STROKE = '#a3acb5' // 銀

function byRank<T>(rank1: T, rank2: T, other: T): ExpressionSpecification {
  return ['match', ['coalesce', ['get', 'rank'], 0], 1, rank1, 2, rank2, other] as ExpressionSpecification
}

function addMajorLabelLayer(
  map: MapLibreMap,
  id: string,
  filter: FilterSpecification,
  minzoom: number,
) {
  map.addLayer({
    id,
    type: 'symbol',
    source: MAJOR_SOURCE,
    minzoom,
    filter,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': LABEL_FONT,
      'text-size': ['interpolate', ['linear'], ['zoom'], 6, 11, 12, 13],
      'text-offset': [0, 1],
      'text-anchor': 'top',
      'text-optional': true,
      // 名山 → 標高の高い山の順に名前を優先して表示する
      'symbol-sort-key': [
        '-',
        ['*', ['coalesce', ['get', 'rank'], 3], 10000],
        ['coalesce', ['get', 'ele'], 0],
      ],
    },
    paint: { 'text-color': '#1d2a24', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
  })
}

export function setSelectedMountain(map: MapLibreMap, coordinates: [number, number] | null) {
  const source = map.getSource(SELECTED_LAYER) as GeoJSONSource | undefined
  source?.setData(
    coordinates
      ? { type: 'Feature', geometry: { type: 'Point', coordinates }, properties: {} }
      : EMPTY,
  )
}
