import type { Category } from '../../types/game'
import { categories } from '../../data/mockGames'
import Tag from '../shared/Tag'

interface CategoryBarProps { active: Category; onChange: (c: Category) => void }

export default function CategoryBar({ active, onChange }: CategoryBarProps) {
  return (
    <div
      className="flex gap-2 overflow-x-auto no-scrollbar py-1"
      style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}
    >
      {categories.map((cat) => (
        <Tag key={cat} label={cat} active={active === cat} onClick={() => onChange(cat)} size="md" />
      ))}
    </div>
  )
}
