import { useState } from 'react'
import { Search, Bell, User, X } from 'lucide-react'

interface TopNavProps {
  activeTab: 'discover' | 'create'
  onTabChange: (tab: 'discover' | 'create') => void
}

export default function TopNav({ activeTab, onTabChange }: TopNavProps) {
  const [searchOpen, setSearchOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 bg-bg/95 backdrop-blur-xl border-b border-border">
      {!searchOpen ? (
        <div className="max-w-[480px] mx-auto px-3 h-12 flex items-center gap-2">
          <span className="text-base flex-shrink-0">🏰</span>

          <nav className="flex items-center bg-white/[0.03] rounded-md p-0.5 flex-shrink-0 border border-border">
            {(['discover', 'create'] as const).map((tab) => {
              const isActive = activeTab === tab
              return (
                <button
                  key={tab}
                  onClick={() => onTabChange(tab)}
                  className={`px-3 py-1 rounded text-[11px] font-comic font-bold transition-all ${
                    isActive
                      ? 'bg-orange text-white shadow-[0_0_12px_rgba(240,118,59,0.3)]'
                      : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  {tab === 'discover' ? '发现' : '创造'}
                </button>
              )
            })}
          </nav>

          <div className="flex-1" />

          <button
            onClick={() => setSearchOpen(true)}
            className="text-ink-soft hover:text-orange active:scale-90 transition-all flex-shrink-0"
          >
            <Search size={16} strokeWidth={2.5} />
          </button>

          <button className="relative text-ink-soft hover:text-orange active:scale-90 transition-all flex-shrink-0">
            <Bell size={16} strokeWidth={2.5} />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red rounded-full border border-bg" />
          </button>

          <div className="w-6 h-6 rounded-full bg-orange flex items-center justify-center text-[9px] active:scale-90 transition-transform flex-shrink-0 shadow-[0_0_8px_rgba(240,118,59,0.3)]">
            <User size={11} className="text-white" strokeWidth={3} />
          </div>
        </div>
      ) : (
        <div className="max-w-[480px] mx-auto px-3 h-12 flex items-center gap-2">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-dim" strokeWidth={2.5} />
            <input
              autoFocus
              placeholder="搜索游戏、作者、标签..."
              className="w-full bg-panel border border-border rounded-full pl-8 pr-3 py-1.5 text-xs text-ink placeholder:text-ink-dim outline-none focus:border-orange/50 focus:shadow-[0_0_12px_rgba(240,118,59,0.1)] transition-all font-body"
            />
          </div>
          <button
            onClick={() => setSearchOpen(false)}
            className="text-ink-soft hover:text-ink active:scale-90 transition-all flex-shrink-0"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>
      )}
    </header>
  )
}
