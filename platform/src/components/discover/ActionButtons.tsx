import { useGame } from '../../context/GameContext'

export default function ActionButtons() {
  const { games, currentIndex, nextGame, toggleFavorite, isFavorite } = useGame()
  const game = games[currentIndex]
  const liked = isFavorite(game.id)

  return (
    <div className="flex items-center justify-center gap-4 py-2">
      {/* Skip */}
      <button onClick={nextGame} className="flex flex-col items-center gap-0.5 active:scale-90 transition-all" aria-label="跳过">
        <div className="w-10 h-10 rounded-full bg-white/[0.04] border border-border flex items-center justify-center hover:border-white/20 transition-colors">
          <span className="font-comic text-ink-soft text-sm">✕</span>
        </div>
        <span className="text-[8px] font-comic text-ink-dim">跳过</span>
      </button>

      {/* Play — BIG */}
      <button className="flex flex-col items-center gap-0.5 active:scale-90 transition-all" aria-label="试玩">
        <div className="w-16 h-16 rounded-full flex items-center justify-center animate-pulse-glow shadow-[0_0_30px_rgba(240,118,59,0.25)]"
          style={{ background: 'linear-gradient(180deg, #F0763B 0%, #D45A2A 100%)' }}>
          <span className="font-display text-white text-xl drop-shadow-[2px_2px_0_rgba(0,0,0,0.3)]">▶</span>
        </div>
        <span className="text-[9px] font-comic text-orange font-bold">试玩</span>
      </button>

      {/* Remix */}
      <button className="flex flex-col items-center gap-0.5 active:scale-90 transition-all" aria-label="改造">
        <div className="w-10 h-10 rounded-full bg-amber comic-box-sm flex items-center justify-center">
          <span className="font-comic text-white text-xs">🔄</span>
        </div>
        <span className="text-[8px] font-comic text-ink-dim">改造</span>
      </button>

      {/* Favorite */}
      <button onClick={() => toggleFavorite(game.id)} className="flex flex-col items-center gap-0.5 active:scale-90 transition-all" aria-label="收藏">
        <div className={`w-10 h-10 rounded-full comic-box-sm flex items-center justify-center transition-colors ${liked ? 'bg-red' : 'bg-panel'}`}>
          <span className="font-comic text-white text-xs">{liked ? '❤️' : '🤍'}</span>
        </div>
        <span className={`text-[8px] font-comic ${liked ? 'text-red' : 'text-ink-dim'}`}>收藏</span>
      </button>
    </div>
  )
}
