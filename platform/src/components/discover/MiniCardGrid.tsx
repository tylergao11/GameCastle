import { useGame } from '../../context/GameContext'
import GameCard from '../shared/GameCard'

export default function MiniCardGrid() {
  const { filteredGames } = useGame()

  return (
    <div className="flex flex-wrap gap-2.5">
      {filteredGames.slice(0, 12).map((game, i) => (
        <GameCard key={game.id} game={game} size="sm" index={i} />
      ))}
    </div>
  )
}
