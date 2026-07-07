import { remixOptions } from '../../data/mockGames'

interface RemixBarProps { onSelect: (opt: string) => void }

export default function RemixBar({ onSelect }: RemixBarProps) {
  return (
    <div className="mt-3">
      <h3 className="font-comic text-[11px] text-ink-dim mb-2 flex items-center gap-1.5 font-bold">
        <span className="w-1 h-3 bg-teal inline-block rounded-full shadow-[0_0_4px_rgba(74,158,181,0.4)]" /> 快捷改造
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {remixOptions.map((opt, i) => (
          <button
            key={opt}
            onClick={() => onSelect(opt)}
            className="px-3 py-1.5 border border-border bg-white/[0.02] text-[11px] text-ink-soft font-comic hover:border-teal/40 hover:text-teal active:scale-95 transition-all rounded-sm"
            style={{ transform: `rotate(${i % 3 === 0 ? '-0.3deg' : i % 3 === 1 ? '0.3deg' : '0deg'})` }}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}
