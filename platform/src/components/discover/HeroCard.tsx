import { ChevronLeft, ChevronRight } from 'lucide-react'
import GameCard from '../shared/GameCard'
import { useGame } from '../../context/GameContext'
import { useSwipe } from '../../hooks/useSwipe'

export default function HeroCard() {
  const { games, currentIndex, nextGame, prevGame, setCurrentIndex } = useGame()
  const game = games[currentIndex]

  const swipe = useSwipe(
    { onSwipeLeft: nextGame, onSwipeRight: prevGame },
    { threshold: 50 }
  )

  return (
    <div className="relative w-full">
      <div {...swipe} className="touch-pan-y select-none">
        <GameCard game={game} size="poster" index={currentIndex} />
      </div>

      <button onClick={prevGame}
        className="absolute -left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 bg-panel/90 backdrop-blur comic-box-sm rounded-full flex items-center justify-center active:scale-90 transition-transform shadow-lg">
        <ChevronLeft size={16} strokeWidth={3} className="text-ink" />
      </button>
      <button onClick={nextGame}
        className="absolute -right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 bg-panel/90 backdrop-blur comic-box-sm rounded-full flex items-center justify-center active:scale-90 transition-transform shadow-lg">
        <ChevronRight size={16} strokeWidth={3} className="text-ink" />
      </button>

      <div className="flex justify-center gap-1.5 mt-2">
        {games.slice(0, 6).map((_, i) => (
          <button key={i} onClick={() => setCurrentIndex(i)}
            className={`rounded-full transition-all duration-300 ${
              i === currentIndex
                ? 'bg-orange w-5 h-1.5 shadow-[0_0_8px_rgba(240,118,59,0.5)]'
                : 'bg-white/10 w-1.5 h-1.5 hover:bg-white/25'
            }`} />
        ))}
      </div>
    </div>
  )
}
