import { useState } from 'react'
import { TabBar, type TabId } from './components/TabBar'
import { loadJson, saveJson } from './lib/storage'
import type { BaseMapType } from './map/baseMap'
import { MapView } from './map/MapView'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { SettingsPage } from './pages/SettingsPage'

type Settings = { baseMapType: BaseMapType }

const SETTINGS_KEY = 'yama-map:settings'
const DEFAULT_SETTINGS: Settings = { baseMapType: 'std' }

function App() {
  const [tab, setTab] = useState<TabId>('map')
  const [settings, setSettings] = useState(() => loadJson(SETTINGS_KEY, DEFAULT_SETTINGS))

  const updateSettings = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    saveJson(SETTINGS_KEY, next)
  }

  return (
    <div className="app">
      <main className="content">
        {/* 地図は他のタブを開いている間も残し、表示位置などを保つ */}
        <div className="tab-panel" hidden={tab !== 'map'}>
          <MapView baseMapType={settings.baseMapType} active={tab === 'map'} />
        </div>
        {tab === 'recommend' && (
          <PlaceholderPage title="おすすめ" note="ステップ4で、選んだ日のおすすめ順の一覧を表示します。" />
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
