import { useGame } from '../context/GameContext'
import GenerationSteps from '../components/create/GenerationSteps'
import GamePreview from '../components/create/GamePreview'
import ModuleCards from '../components/create/ModuleCards'
import RemixBar from '../components/create/RemixBar'
import CreateInput from '../components/create/CreateInput'

export default function CreatePage() {
  const { generatedGame, generationStep } = useGame()
  const hasGame = generationStep === 'complete' && generatedGame

  return (
    <div className="h-full flex flex-col max-w-[480px] mx-auto px-3" style={{ height: 'calc(100vh - 96px)' }}>
      <div className="flex-shrink-0">
        <GenerationSteps />
      </div>

      <div className="flex-shrink-0 px-2">
        <GamePreview />
      </div>

      {hasGame && (
        <div className="flex-shrink-0 flex justify-center py-1.5">
          <button className="px-6 py-2 bg-orange rounded-sm font-comic text-xs text-white font-bold active:animate-bounce-pop shadow-[0_0_16px_rgba(240,118,59,0.25)]">
            🚀 发布到发现流
          </button>
        </div>
      )}

      <div className="flex-shrink-0">
        <ModuleCards />
      </div>

      {hasGame && (
        <div className="flex-shrink-0">
          <RemixBar onSelect={() => {}} />
        </div>
      )}

      <div className="flex-1 min-h-0" />

      <div className="flex-shrink-0">
        <CreateInput />
      </div>
    </div>
  )
}
