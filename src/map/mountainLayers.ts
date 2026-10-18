import type {
  ExpressionSpecification,
  FilterSpecification,
  GeoJSONSource,
  Map as MapLibreMap,
} from 'maplibre-gl'
import { loadMajorMountains, loadOtherMountains } from '../data/mountains'

export const MAJOR_SOURCE = 'mountains-major'
export const OTHER_SOURCE = 'mountains-other'
export const SELECTED_LAYER = 'mountain-selected'

/**
 * 拡大するにつれて表示する山を増やす。
 * 百名山 → 二百・三百名山 → その他の主要な山 → OSM のその他の山 の順に現れる
 */
const STAGES = {
  rank1: { pointZoom: 0, labelZoom: 6 },
  rank2: { pointZoom: 6, labelZoom: 7.5 },
  major: { pointZoom: 8, labelZoom: 9.5 },
  other: { pointZoom: 10, labelZoom: 12 },
}

/** その他の山（OSM）を表示し始める縮尺 */
export const OTHER_MIN_ZOOM = STAGES.other.pointZoom

const COLORS = {
  rank1: '#d64545', // 赤：百名山
  rank2: '#2f8f5b', // 緑：二百・三百名山
  major: '#7a8580', // 灰色：その他の主要な山
  other: '#97a09b', // 灰色（薄め）：OSM のその他の山
}

const RANK1_FILTER: FilterSpecification = ['==', ['get', 'rank'], 1]
const RANK2_FILTER: FilterSpecification = ['==', ['get', 'rank'], 2]
const NO_RANK_FILTER: FilterSpecification = ['!', ['has', 'rank']]

/** タップで山を選べるレイヤー（上に描くものから順） */
export const MOUNTAIN_POINT_LAYERS = [
  'mountains-rank1-point',
  'mountains-rank2-point',
  'mountains-major-point',
  'mountains-other-point',
]

const EMPTY = { type: 'FeatureCollection' as const, features: [] }

const LABEL_FONT = ['Open Sans Semibold']

export async function addMountainLayers(map: MapLibreMap) {
  map.addSource(MAJOR_SOURCE, { type: 'geojson', data: EMPTY })
  map.addSource(OTHER_SOURCE, { type: 'geojson', data: EMPTY })
  map.addSource(SELECTED_LAYER, { type: 'geojson', data: EMPTY })

  // 下に描くものから追加する
  addPointLayer(map, {
    id: 'mountains-other-point',
    source: OTHER_SOURCE,
    minzoom: STAGES.other.pointZoom,
    color: COLORS.other,
    radius: [10, 3.5, 14, 6],
    strokeWidth: 1,
  })
  addPointLayer(map, {
    id: 'mountains-major-point',
    source: MAJOR_SOURCE,
    filter: NO_RANK_FILTER,
    minzoom: STAGES.major.pointZoom,
    color: COLORS.major,
    radius: [8, 4.5, 13, 7.5],
    strokeWidth: 1.5,
  })
  addPointLayer(map, {
    id: 'mountains-rank2-point',
    source: MAJOR_SOURCE,
    filter: RANK2_FILTER,
    minzoom: STAGES.rank2.pointZoom,
    color: COLORS.rank2,
    radius: [6, 5, 13, 9],
    strokeWidth: 1.5,
  })
  addPointLayer(map, {
    id: 'mountains-rank1-point',
    source: MAJOR_SOURCE,
    filter: RANK1_FILTER,
    minzoom: STAGES.rank1.pointZoom,
    color: COLORS.rank1,
    radius: [4, 5, 13, 11],
    strokeWidth: 2,
  })

  addLabelLayer(map, 'mountains-other-label', OTHER_SOURCE, null, STAGES.other.labelZoom, 11)
  addLabelLayer(map, 'mountains-major-label', MAJOR_SOURCE, NO_RANK_FILTER, STAGES.major.labelZoom, 12)
  addLabelLayer(map, 'mountains-rank2-label', MAJOR_SOURCE, RANK2_FILTER, STAGES.rank2.labelZoom, 12)
  addLabelLayer(map, 'mountains-rank1-label', MAJOR_SOURCE, RANK1_FILTER, STAGES.rank1.labelZoom, 13)

  // 選んだ山の強調表示
  map.addLayer({
    id: SELECTED_LAYER,
    type: 'circle',
    source: SELECTED_LAYER,
    paint: {
      'circle-radius': 15,
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

type PointLayerOptions = {
  id: string
  source: string
  filter?: FilterSpecification
  minzoom: number
  color: string
  /** [縮尺1, 半径1, 縮尺2, 半径2]。その間は滑らかに大きくする */
  radius: [number, number, number, number]
  strokeWidth: number
}

function addPointLayer(map: MapLibreMap, o: PointLayerOptions) {
  const [z1, r1, z2, r2] = o.radius
  map.addLayer({
    id: o.id,
    type: 'circle',
    source: o.source,
    minzoom: o.minzoom,
    ...(o.filter ? { filter: o.filter } : {}),
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], z1, r1, z2, r2] as ExpressionSpecification,
      'circle-color': o.color,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': o.strokeWidth,
    },
  })
}

function addLabelLayer(
  map: MapLibreMap,
  id: string,
  source: string,
  filter: FilterSpecification | null,
  minzoom: number,
  size: number,
) {
  map.addLayer({
    id,
    type: 'symbol',
    source,
    minzoom,
    ...(filter ? { filter } : {}),
    layout: {
      'text-field': ['get', 'name'],
      'text-font': LABEL_FONT,
      'text-size': size,
      'text-offset': [0, 1],
      'text-anchor': 'top',
      'text-optional': true,
      // 標高の高い山の名前を優先して表示する
      'symbol-sort-key': ['-', 0, ['coalesce', ['get', 'ele'], 0]],
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
