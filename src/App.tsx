import { useEffect, useState } from 'react'
import { TabBar, type TabId } from './components/TabBar'
import type { Mountain } from './data/mountains'
import { loadRecommendations, type SightFilter } from './data/recommendations'
import { loadJson, saveJson } from './lib/storage'
import { nextSaturday } from './logic/date'
import type { RecommendationsFile } from './logic/recommendationsFile'
import type { BaseMapType } from './map/baseMap'
import { MapView, type MapFocusRequest } from './map/MapView'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { RecommendPage } from './pages/RecommendPage'
import { SettingsPage } from './pages/SettingsPage'

type Settings = { baseMapType: BaseMapType }

const SETTINGS_KEY = 'yama-map:settings'
const DEFAULT_SETTINGS: Settings = { baseMapType: 'std' }

function App() {
  const [tab, setTab] = useState<TabId>('map')
  const [settings, setSettings] = useState(() => loadJson(SETTINGS_KEY, DEFAULT_SETTINGS))
  // 地図とおすすめ一覧で共通の条件。最初は次の土曜日
  const [targetDate, setTargetDate] = useState(() => nextSaturday())
  const [sight, setSight] = useState<SightFilter>('all')
  const [recommendations, setRecommendations] = useState<RecommendationsFile | null>(null)
  const [focus, setFocus] = useState<MapFocusRequest | null>(null)

  useEffect(() => {
    loadRecommendations().then(setRecommendations)
  }, [])

  const updateSettings = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    saveJson(SETTINGS_KEY, next)
  }

  const showOnMap = (mountain: Mountain) => {
    setTab('map')
    setFocus((f) => ({ mountain, seq: (f?.seq ?? 0) + 1 }))
  }

  return (
    <div className="app">
      <main className="content">
        {/* 地図は他のタブを開いている間も残し、表示位置などを保つ */}
        <div className="tab-panel" hidden={tab !== 'map'}>
          <MapView
            baseMapType={settings.baseMapType}
            active={tab === 'map'}
            targetDate={targetDate}
            onTargetDateChange={setTargetDate}
            sight={sight}
            onSightChange={setSight}
            recommendations={recommendations}
            focus={focus}
          />
        </div>
        {tab === 'recommend' && (
          <RecommendPage
            targetDate={targetDate}
            onTargetDateChange={setTargetDate}
            sight={sight}
            onSightChange={setSight}
            recommendations={recommendations}
            onSelect={showOnMap}
          />
        )}
        {tab === 'records' && (
          <PlaceholderPage title="記録" note="ステップ5で、登山記録を見たり書いたりできるようにします。" />
        )}
        {tab === 'settings' && (
          <SettingsPage
            baseMapType={settings.baseMapType}
            onBaseMapTypeChange={(baseMapType) => updateSettings({ baseMapType })}
          />
        )}
      </main>
      <TabBar current={tab} onChange={setTab} />
    </div>
  )
}

export default App
