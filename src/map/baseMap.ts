import type { StyleSpecification } from 'maplibre-gl'

export type BaseMapType = 'std' | 'hillshade'

export const BASE_MAP_LABELS: Record<BaseMapType, string> = {
  std: '標準地図',
  hillshade: '陰影起伏図',
}

const GSI_ATTRIBUTION =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>'

export const GSI_TILE_ORIGIN = 'https://cyberjapandata.gsi.go.jp'

// 標準地図の上に陰影起伏図を重ねる。陰影の表示・非表示は setBaseMapType で切り替える
export const baseMapStyle: StyleSpecification = {
  version: 8,
  // 英数字の文字データ。日本語は端末のフォントで描く（MapView の localIdeographFontFamily）
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    std: {
      type: 'raster',
      tiles: [`${GSI_TILE_ORIGIN}/xyz/std/{z}/{x}/{y}.png`],
      tileSize: 256,
      minzoom: 2,
      maxzoom: 18,
      attribution: GSI_ATTRIBUTION,
    },
    hillshade: {
      type: 'raster',
      tiles: [`${GSI_TILE_ORIGIN}/xyz/hillshademap/{z}/{x}/{y}.png`],
      tileSize: 256,
      minzoom: 2,
      maxzoom: 16,
      attribution: GSI_ATTRIBUTION,
    },
  },
  layers: [
    { id: 'std', type: 'raster', source: 'std' },
    {
      id: 'hillshade',
      type: 'raster',
      source: 'hillshade',
      layout: { visibility: 'none' },
      paint: { 'raster-opacity': 0.45 },
    },
  ],
}

export const HILLSHADE_LAYER_ID = 'hillshade'
