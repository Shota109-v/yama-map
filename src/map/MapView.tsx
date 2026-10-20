import {
  AttributionControl,
  GeolocateControl,
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useRef, useState } from 'react'
import { DateSelect } from '../components/DateSelect'
import { SightChips } from '../components/SightChips'
import type { ClimbRecord } from '../data/db'
import { toMountain, type Mountain, type MountainProps } from '../data/mountains'
import { displayStates, type SightFilter } from '../data/recommendations'
import { useClimbedIds } from '../data/useRecords'
import { filterInfo } from '../logic/recommend'
import { loadJson, saveJson } from '../lib/storage'
import type { RecommendationsFile } from '../logic/recommendationsFile'
import { baseMapStyle, HILLSHADE_LAYER_ID, type BaseMapType } from './baseMap'
import { Legend } from './Legend'
import {
  addMountainLayers,
  applyClimbed,
  applyMountainStates,
  MOUNTAIN_POINT_LAYERS,
  setHighlightColor,
  setSelectedMountain,
} from './mountainLayers'
import { MountainSheet, PEEK_HEIGHT } from './MountainSheet'
import { SearchPanel } from './SearchPanel'

// MapLibre は実行時に自分の場所からワーカーを探すため、ビルド後に見つからない。
// Vite にファイルを出力させ、その URL を明示的に渡す
setWorkerUrl(workerUrl)

type MapViewState = { center: [number, number]; zoom: number }

const VIEW_KEY = 'yama-map:view'
// 初めて開いたときは日本全体
const DEFAULT_VIEW: MapViewState = { center: [137.5, 37.6], zoom: 4.3 }

/** 指でタップしたときに山を拾う範囲（px） */
const TAP_TOLERANCE = 12

/** 他の画面から「この山を地図で見せて」と頼むときの値。seq を変えると同じ山でも再度動く */
export type MapFocusRequest = { mountain: Mountain; seq: number }

type Props = {
  baseMapType: BaseMapType
  /** 地図タブが表示されているか。非表示から戻ったときに描画サイズを合わせ直す */
  active: boolean
  targetDate: string
  onTargetDateChange: (date: string) => void
  sight: SightFilter
  onSightChange: (sight: SightFilter) => void
  recommendations: RecommendationsFile | null
  focus: MapFocusRequest | null
  onRecord: (mountain: Mountain) => void
  onEditRecord: (record: ClimbRecord) => void
}

export function MapView({
  baseMapType,
  active,
  targetDate,
  onTargetDateChange,
  sight,
  onSightChange,
  recommendations,
  focus,
  onRecord,
  onEditRecord,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [layersReady, setLayersReady] = useState(false)
  const [selected, setSelected] = useState<Mountain | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)

  useEffect(() => {
    const view = loadJson(VIEW_KEY, DEFAULT_VIEW)
    const map = new MapLibreMap({
      container: containerRef.current!,
      style: baseMapStyle,
      center: view.center,
      zoom: view.zoom,
      minZoom: 3,
      maxBounds: [
        [118, 20],
        [158, 50],
      ],
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      localIdeographFontFamily: "'Hiragino Sans', 'Yu Gothic UI', 'Noto Sans JP', sans-serif",
    })
    map.touchZoomRotate.disableRotation()
    map.addControl(
      new AttributionControl({
        compact: true,
        customAttribution:
          '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>',
      }),
      'bottom-left',
    )
    // 上部は日付などの切り替えに使うので、操作ボタンは右下にまとめる
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')
    map.addControl(
      new GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      'bottom-right',
    )

    // 前回見ていた位置と縮尺を保存する
    map.on('moveend', () => {
      const c = map.getCenter()
      saveJson(VIEW_KEY, { center: [c.lng, c.lat], zoom: map.getZoom() })
    })

    map.on('load', () => {
      addMountainLayers(map).then(
        () => setLayersReady(true),
        (e) => console.error(e),
      )
    })

    // 山をタップしたら選ぶ。何もない所をタップしたら選択を外す
    map.on('click', (e) => {
      const { x, y } = e.point
      const layers = MOUNTAIN_POINT_LAYERS.filter((id) => map.getLayer(id))
      const features = map.queryRenderedFeatures(
        [
          [x - TAP_TOLERANCE, y - TAP_TOLERANCE],
          [x + TAP_TOLERANCE, y + TAP_TOLERANCE],
        ],
        { layers },
      )
      // 百名山 → 三百名山 → その他の順に優先する（レイヤーは上にあるものから返る）
      const f = features[0]
      if (f && f.geometry.type === 'Point') {
        const m = toMountain(f.properties as MountainProps, f.geometry.coordinates)
        setSelected(m)
        // パネルに隠れる位置の山は、見える所まで地図を動かす
        const p = map.project([m.lon, m.lat])
        const visibleBottom = map.getContainer().clientHeight - PEEK_HEIGHT - 24
        if (p.y > visibleBottom) map.panBy([0, p.y - visibleBottom + 40])
      } else {
        setSelected(null)
      }
    })
    for (const layer of MOUNTAIN_POINT_LAYERS) {
      map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''))
    }

    mapRef.current = map
    // 開発中だけ、ブラウザの開発ツールから地図を調べられるようにする
    if (import.meta.env.DEV) (window as unknown as { __map: MapLibreMap }).__map = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () =>
      map.setLayoutProperty(
        HILLSHADE_LAYER_ID,
        'visibility',
        baseMapType === 'hillshade' ? 'visible' : 'none',
      )
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
  }, [baseMapType])

  useEffect(() => {
    if (active) mapRef.current?.resize()
  }, [active])

  useEffect(() => {
    const map = mapRef.current
    if (map) setSelectedMountain(map, selected ? [selected.lon, selected.lat] : null)
  }, [selected])

  // 選んだ日・見どころに合わせて、点を薄くしたりおすすめの輪を付けたりする
  useEffect(() => {
    const map = mapRef.current
    if (!map || !layersReady) return
    applyMountainStates(map, recommendations ? displayStates(recommendations, targetDate, sight) : new Map())
    if (sight !== 'all') setHighlightColor(map, filterInfo(sight).color)
  }, [layersReady, recommendations, targetDate, sight])

  // 記録した山を青くする（記録が増減するとすぐ反映される）
  const climbedIds = useClimbedIds()
  useEffect(() => {
    const map = mapRef.current
    if (map && layersReady) applyClimbed(map, climbedIds)
  }, [layersReady, climbedIds])

  const flyToMountain = (m: Mountain) => {
    mapRef.current?.flyTo({
      center: [m.lon, m.lat],
      zoom: Math.max(mapRef.current.getZoom(), 11),
      // パネルの分だけ山を上にずらして表示する
      offset: [0, -PEEK_HEIGHT / 2],
    })
  }

  const showMountain = (m: Mountain) => {
    setSelected(m)
    flyToMountain(m)
  }

  // おすすめ一覧などから山を選んだとき：選択は描画中に切り替え、地図の移動は描画後に行う
  const [handledFocusSeq, setHandledFocusSeq] = useState(0)
  if (focus && focus.seq !== handledFocusSeq) {
    setHandledFocusSeq(focus.seq)
    setSelected(focus.mountain)
  }
  useEffect(() => {
    // タブを切り替えた直後は地図の大きさが変わっているので合わせてから動かす
    mapRef.current?.resize()
    if (focus) flyToMountain(focus.mountain)
  }, [focus])

  return (
    <>
      <div ref={containerRef} className="map-view" />

      <div className="map-toolbar">
        <div className="map-toolbar-row">
          <div className="map-toolbar-group">
            <button type="button" className="map-search-button" onClick={() => setSearchOpen(true)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="M16 16l4.5 4.5" />
              </svg>
              山を検索
            </button>
            <DateSelect value={targetDate} onChange={onTargetDateChange} className="map-date-select" />
          </div>
          <button type="button" className="map-legend-button" onClick={() => setLegendOpen((v) => !v)}>
            凡例
          </button>
        </div>
        <SightChips date={targetDate} value={sight} onChange={onSightChange} />
        {sight !== 'all' && !recommendations?.dates.includes(targetDate) && (
          <p className="map-notice">
            おすすめデータがまだないため、地図には反映されません（毎朝2時から計算し、早朝に更新されます）。山をタップすると詳細では確認できます。
          </p>
        )}
        {legendOpen && (
          <Legend
            date={targetDate}
            sight={sight}
            generatedAt={recommendations?.generatedAt ?? null}
            onClose={() => setLegendOpen(false)}
          />
        )}
      </div>

      {selected && (
        <MountainSheet
          key={selected.id}
          mountain={selected}
          targetDate={targetDate}
          onClose={() => setSelected(null)}
          onRecord={onRecord}
          onEditRecord={onEditRecord}
        />
      )}

      {searchOpen && (
        <SearchPanel
          onSelect={(m) => {
            setSearchOpen(false)
            showMountain(m)
          }}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </>
  )
}
