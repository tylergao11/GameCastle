import { promptExamples } from '../../data/mockGames'
interface PromptChipsProps { onSelect: (p: string) => void }
export default function PromptChips({ onSelect }: PromptChipsProps) {
  return (
    <div className="flex flex-nowrap gap-1.5 mb-3 overflow-x-auto no-scrollbar pb-1" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}>
      {promptExamples.map((p, i) => (
        <button key={p} onClick={() => onSelect(p)}
          className="flex-shrink-0 px-2.5 py-1.5 border border-border bg-white/[0.02] text-[10px] text-ink-soft font-comic hover:border-orange/40 hover:text-orange active:scale-95 transition-all rounded-sm"
          style={{ transform: `rotate(${i%2===0?'-0.3deg':'0.3deg'})` }}>{p}</button>
      ))}
    </div>
  )
}
