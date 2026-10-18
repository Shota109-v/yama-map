import type {
  ExpressionSpecification,
  FilterSpecification,
  GeoJSONSource,
  Map as MapLibreMap,
} from 'maplibre-gl'
import { loadMajorMountains, loadOtherMountains } from '../data/mountains'
import type { MountainDisplayState } from '../data/recommendations'

export const MAJOR_SOURCE = 'mountains-major'
export const OTHER_SOURCE = 'mountains-other'
export const SELECTED_LAYER = 'mountain-selected'

/**
 * 拡大するにつれて表示する山を増やす。
 * 百名山 → 三百名山 → その他の主要な山 → OSM のその他の山 の順に現れる
 */
const STAGES = {
  rank1: { pointZoom: 0, labelZoom: 6 },
  rank2: { pointZoom: 7.5, labelZoom: 8.5 },
  major: { pointZoom: 9, labelZoom: 10 },
  other: { pointZoom: 10.5, labelZoom: 12 },
}

/** その他の山（OSM）を表示し始める縮尺 */
export const OTHER_MIN_ZOOM = STAGES.other.pointZoom

const COLORS = {
  rank1: '#d64545', // 赤：百名山
  rank2: '#2f8f5b', // 緑：三百名山（百名山以外）
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
  // おすすめ度や登頂済みを山ごとの状態（feature-state）で渡すため、id を feature の id にする
  map.addSource(MAJOR_SOURCE, { type: 'geojson', data: EMPTY, promoteId: 'id' })
  map.addSource(OTHER_SOURCE, { type: 'geojson', data: EMPTY, promoteId: 'id' })
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
    radius: [9, 4.5, 13, 7.5],
    strokeWidth: 1.5,
  })
  addPointLayer(map, {
    id: 'mountains-rank2-point',
    source: MAJOR_SOURCE,
    filter: RANK2_FILTER,
    minzoom: STAGES.rank2.pointZoom,
    color: COLORS.rank2,
    radius: [7.5, 5, 13, 9],
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

  // 選んだ山の強調表示（おすすめの輪のオレンジ・登頂済みの青と区別するため紫にする）
  map.addLayer({
    id: SELECTED_LAYER,
    type: 'circle',
    source: SELECTED_LAYER,
    paint: {
      'circle-radius': 17,
      'circle-color': 'rgba(124, 58, 237, 0.15)',
      'circle-stroke-color': '#7c3aed',
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

/** 天気が悪い日・絞り込みに合わない山は薄く表示する */
const DIM_OPACITY = 0.3
const dimmed: ExpressionSpecification = ['boolean', ['feature-state', 'dim'], false]
const highlighted: ExpressionSpecification = ['boolean', ['feature-state', 'hl'], false]
const climbed: ExpressionSpecification = ['boolean', ['feature-state', 'climbed'], false]

/** 見頃の山に付ける輪の色（最初の値。選んだ見どころに合わせて setHighlightColor で変える） */
const HIGHLIGHT_COLOR = '#f08c00'
/** 登頂済みの山の色 */
export const CLIMBED_COLOR = '#2563eb'

function addPointLayer(map: MapLibreMap, o: PointLayerOptions) {
  const [z1, r1, z2, r2] = o.radius
  const radius = (extra: number) =>
    ['interpolate', ['linear'], ['zoom'], z1, r1 + extra, z2, r2 + extra] as ExpressionSpecification
  const filter = o.filter ? { filter: o.filter } : {}

  // おすすめの山を囲む輪（主要な山だけ。点の下に描く）
  if (o.source === MAJOR_SOURCE) {
    map.addLayer({
      id: `${o.id}-ring`,
      type: 'circle',
      source: o.source,
      minzoom: o.minzoom,
      ...filter,
      paint: {
        'circle-radius': radius(4),
        'circle-color': 'rgba(0, 0, 0, 0)',
        'circle-stroke-color': HIGHLIGHT_COLOR,
        'circle-stroke-width': 3,
        'circle-stroke-opacity': ['case', highlighted, 1, 0],
      },
    })
  }

  map.addLayer({
    id: o.id,
    type: 'circle',
    source: o.source,
    minzoom: o.minzoom,
    ...filter,
    paint: {
      'circle-radius': radius(0),
      // 登頂済みの山は青にする（大きさはグループのまま）
      'circle-color': ['case', climbed, CLIMBED_COLOR, o.color],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': o.strokeWidth,
      'circle-opacity': ['case', dimmed, DIM_OPACITY, 1],
      'circle-stroke-opacity': ['case', dimmed, DIM_OPACITY, 1],
    },
  })
}

/** 主要な山ごとに、薄くするか・おすすめの輪を付けるかを設定する */
// 前回設定した山。登頂済みとおすすめは別々に更新するので、自分が付けた分だけを外す
let displayedIds: string[] = []
let climbedIdsShown: string[] = []

export function applyMountainStates(map: MapLibreMap, states: Map<string, MountainDisplayState>) {
  if (!map.getSource(MAJOR_SOURCE)) return
  for (const id of displayedIds) {
    map.removeFeatureState({ source: MAJOR_SOURCE, id }, 'dim')
    map.removeFeatureState({ source: MAJOR_SOURCE, id }, 'hl')
  }
  for (const [id, state] of states) map.setFeatureState({ source: MAJOR_SOURCE, id }, state)
  displayedIds = [...states.keys()]
}

/** 見頃の山を囲む輪の色を、選んだ見どころの色にする */
export function setHighlightColor(map: MapLibreMap, color: string) {
  for (const id of MOUNTAIN_POINT_LAYERS) {
    const ring = `${id}-ring`
    if (map.getLayer(ring)) map.setPaintProperty(ring, 'circle-stroke-color', color)
  }
}

/** 登頂済みの山を青くする。どちらのデータに入っている山か分からないので両方に設定する */
export function applyClimbed(map: MapLibreMap, ids: Set<string>) {
  if (!map.getSource(MAJOR_SOURCE)) return
  for (const source of [MAJOR_SOURCE, OTHER_SOURCE]) {
    for (const id of climbedIdsShown) map.removeFeatureState({ source, id }, 'climbed')
    for (const id of ids) map.setFeatureState({ source, id }, { climbed: true })
  }
  climbedIdsShown = [...ids]
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
