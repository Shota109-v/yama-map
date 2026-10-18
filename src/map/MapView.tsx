import {
  AttributionControl,
  GeolocateControl,
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useRef } from 'react'
import { loadJson, saveJson } from '../lib/storage'
import { baseMapStyle, HILLSHADE_LAYER_ID, type BaseMapType } from './baseMap'

// MapLibre は実行時に自分の場所からワーカーを探すため、ビルド後に見つからない。
// Vite にファイルを出力させ、その URL を明示的に渡す
setWorkerUrl(workerUrl)

type MapViewState ={ center: [number, number]; zoom: number }

const VIEW_KEY = 'yama-map:view'
// 初めて開いたときは日本全体
const DEFAULT_VIEW: MapViewState = { center: [137.5, 37.6], zoom: 4.3 }

type Props = {
  baseMapType: BaseMapType
  /** 地図タブが表示されているか。非表示から戻ったときに描画サイズを合わせ直す */
  active: boolean
}

export function MapView({ baseMapType, active }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)

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
    })
    map.touchZoomRotate.disableRotation()
    map.addControl(new AttributionControl({ compact: true }), 'bottom-left')
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

  return <div ref={containerRef} className="map-view" />
}
