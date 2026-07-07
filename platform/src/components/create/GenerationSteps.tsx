import { useGame } from '../../context/GameContext'

const steps = [
  { key: 'understanding' as const, label: '理解', emoji: '🧠' },
  { key: 'designing' as const, label: '设计', emoji: '🎨' },
  { key: 'levels' as const, label: '关卡', emoji: '🗺️' },
  { key: 'enemies' as const, label: '敌人', emoji: '👾' },
  { key: 'assets' as const, label: '素材', emoji: '🖼️' },
  { key: 'complete' as const, label: '试玩', emoji: '🎮' },
]

export default function GenerationSteps() {
  const { generationStep } = useGame()
  if (generationStep === 'idle') return null

  const stepIndex = steps.findIndex((s) => s.key === generationStep)

  return (
    <div className="flex items-center gap-0 py-1.5 overflow-x-auto no-scrollbar justify-center">
      {steps.map((step, i) => {
        const done = i < stepIndex || generationStep === 'complete'
        const active = i === stepIndex && generationStep !== 'complete'
        return (
          <div key={step.key} className="flex items-center flex-shrink-0">
            <div className={`flex flex-col items-center px-1.5 py-1 min-w-[44px] rounded-sm transition-all ${
              done ? 'bg-teal/20 border border-teal/30 opacity-70' : active ? 'bg-orange border border-orange/50 shadow-[0_0_8px_rgba(240,118,59,0.2)]' : 'bg-white/[0.02] opacity-25'
            }`}>
              <span className="text-[10px]">{step.emoji}</span>
              <span className={`text-[7px] font-comic font-bold ${active ? 'text-white' : 'text-ink-dim'}`}>
                {done && generationStep !== 'complete' ? '✓' : active ? '⚡' : ''}{step.label}
              </span>
            </div>
            {i < steps.length - 1 && <div className="w-1.5 h-px bg-border flex-shrink-0 mx-0.5" />}
          </div>
        )
      })}
    </div>
  )
}
