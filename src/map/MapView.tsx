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
import { toMountain, type Mountain, type MountainProps } from '../data/mountains'
import { loadJson, saveJson } from '../lib/storage'
import { nextSaturday } from '../logic/date'
import { baseMapStyle, HILLSHADE_LAYER_ID, type BaseMapType } from './baseMap'
import {
  addMountainLayers,
  MAJOR_POINT_LAYER,
  OTHER_POINT_LAYER,
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

type Props = {
  baseMapType: BaseMapType
  /** 地図タブが表示されているか。非表示から戻ったときに描画サイズを合わせ直す */
  active: boolean
}

export function MapView({ baseMapType, active }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [selected, setSelected] = useState<Mountain | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  // ステップ4で日付の切り替えをつける。それまでは次の土曜日
  const [targetDate] = useState(() => nextSaturday())

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
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
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
      addMountainLayers(map).catch((e) => console.error(e))
    })

    // 山をタップしたら選ぶ。何もない所をタップしたら選択を外す
    map.on('click', (e) => {
      const { x, y } = e.point
      const layers = [MAJOR_POINT_LAYER, OTHER_POINT_LAYER].filter((id) => map.getLayer(id))
      const features = map.queryRenderedFeatures(
        [
          [x - TAP_TOLERANCE, y - TAP_TOLERANCE],
          [x + TAP_TOLERANCE, y + TAP_TOLERANCE],
        ],
        { layers },
      )
      // 主要な山を優先する（レイヤーは上にあるものから返る）
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
    for (const layer of [MAJOR_POINT_LAYER, OTHER_POINT_LAYER]) {
      map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''))
    }

    mapRef.current = map
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

  const selectFromSearch = (m: Mountain) => {
    setSearchOpen(false)
    setSelected(m)
    mapRef.current?.flyTo({
      center: [m.lon, m.lat],
      zoom: Math.max(mapRef.current.getZoom(), 12),
      // パネルの分だけ山を上にずらして表示する
      offset: [0, -PEEK_HEIGHT / 2],
    })
  }

  return (
    <>
      <div ref={containerRef} className="map-view" />

      <button type="button" className="map-search-button" onClick={() => setSearchOpen(true)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4.5 4.5" />
        </svg>
        山を検索
      </button>

      {selected && (
        <MountainSheet
          key={selected.id}
          mountain={selected}
          targetDate={targetDate}
          onClose={() => setSelected(null)}
        />
      )}

      {searchOpen && <SearchPanel onSelect={selectFromSearch} onClose={() => setSearchOpen(false)} />}
    </>
  )
}
