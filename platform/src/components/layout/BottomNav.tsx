import { Compass, Trophy, Gift, Hammer, Users, User } from 'lucide-react'

interface BottomNavProps {
  active: string
  onChange: (key: string) => void
}

const items = [
  { key: 'discover', label: '发现', Icon: Compass },
  { key: 'leaderboard', label: '排行', Icon: Trophy },
  { key: 'chest', label: '宝箱', Icon: Gift },
  { key: 'create', label: '建造', Icon: Hammer },
  { key: 'community', label: '社区', Icon: Users },
  { key: 'profile', label: '我的', Icon: User },
]

export default function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-bg/98 backdrop-blur-xl border-t border-border">
      <div className="max-w-[480px] mx-auto flex justify-around items-center h-12 px-1">
        {items.map(({ key, label, Icon }) => {
          const isActive = active === key
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className={`relative flex flex-col items-center gap-0 min-w-0 flex-1 py-1 active:scale-85 transition-all ${
                isActive ? 'text-orange' : 'text-ink-dim hover:text-ink-soft'
              }`}
            >
              <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[9px] font-comic leading-none font-bold">{label}</span>
              {isActive && (
                <div className="absolute -top-0.5 w-3 h-1 bg-orange rounded-full shadow-[0_0_6px_rgba(240,118,59,0.5)]" />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
