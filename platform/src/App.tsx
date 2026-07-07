import { useState } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { GameProvider } from './context/GameContext'
import TopNav from './components/layout/TopNav'
import BottomNav from './components/layout/BottomNav'
import DiscoverPage from './pages/DiscoverPage'
import CreatePage from './pages/CreatePage'
import PlaceholderPage from './pages/PlaceholderPage'

function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const [bottomTab, setBottomTab] = useState('discover')

  const activeTab: 'discover' | 'create' =
    location.pathname === '/create' ? 'create' : 'discover'

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <TopNav
        activeTab={activeTab}
        onTabChange={(tab) => { setBottomTab(tab); navigate(tab === 'discover' ? '/' : '/create') }}
      />

      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<DiscoverPage />} />
          <Route path="/discover" element={<DiscoverPage />} />
          <Route path="/create" element={<CreatePage />} />
          <Route path="/leaderboard" element={<PlaceholderPage icon="🏆" title="排行榜" />} />
          <Route path="/chest" element={<PlaceholderPage icon="🎁" title="宝箱" />} />
          <Route path="/community" element={<PlaceholderPage icon="💬" title="社区" />} />
          <Route path="/favorites" element={<PlaceholderPage icon="❤️" title="我的收藏" />} />
          <Route path="/works" element={<PlaceholderPage icon="🎮" title="我的作品" />} />
          <Route path="/profile" element={<PlaceholderPage icon="👤" title="个人中心" />} />
        </Routes>
      </main>

      <BottomNav
        active={bottomTab}
        onChange={(key) => { setBottomTab(key); navigate(key === 'discover' ? '/' : `/${key}`) }}
      />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <GameProvider>
        <AppShell />
      </GameProvider>
    </BrowserRouter>
  )
}
