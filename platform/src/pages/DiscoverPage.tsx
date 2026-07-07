import HeroCard from '../components/discover/HeroCard'
import CategoryBar from '../components/discover/CategoryBar'
import ActionButtons from '../components/discover/ActionButtons'
import { useGame } from '../context/GameContext'

export default function DiscoverPage() {
  const { activeCategory, setActiveCategory } = useGame()

  return (
    <div className="h-full flex flex-col max-w-[480px] mx-auto px-3" style={{ height: 'calc(100vh - 96px)' }}>
      <div className="py-1.5 flex-shrink-0">
        <CategoryBar active={activeCategory} onChange={setActiveCategory} />
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center py-1">
        <HeroCard />
      </div>

      <div className="flex-shrink-0">
        <ActionButtons />
      </div>

      <div className="flex-shrink-0 pb-1">
        <div className="flex items-center gap-1.5 comic-box-sm px-2.5 py-1.5">
          <span className="text-[10px] font-comic text-ink-dim flex-shrink-0">💡 改造</span>
          <input
            placeholder="输入想法..."
            className="flex-1 bg-transparent text-[11px] text-ink placeholder:text-ink-dim outline-none font-body min-w-0"
          />
          <button className="flex-shrink-0 px-3 py-1 bg-orange rounded-sm font-comic text-[10px] text-white font-bold active:animate-bounce-pop shadow-[0_0_10px_rgba(240,118,59,0.2)]">
            二创
          </button>
        </div>
      </div>
    </div>
  )
}
