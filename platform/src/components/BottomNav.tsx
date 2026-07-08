import { Compass, Plus, User } from "lucide-react";

export default function BottomNav() {
  return (
    <nav className="bottom-nav flex items-center justify-around z-[100] glass">
      <button className="flex flex-col items-center gap-1 px-4 py-2 border-0 bg-transparent text-white/45 text-[11px] font-semibold cursor-pointer hover:text-white/75 transition-colors">
        <Compass size={20} />
        <span>探索</span>
      </button>

      <button className="flex flex-col items-center gap-1 p-0 border-0 bg-transparent text-white/75 text-[11px] font-semibold cursor-pointer -mt-5">
        <div className="bottom-nav-btn-create flex items-center justify-center">
          <Plus size={22} color="#fff" strokeWidth={3} />
        </div>
        <span>创建</span>
      </button>

      <button className="flex flex-col items-center gap-1 px-4 py-2 border-0 bg-transparent text-white/45 text-[11px] font-semibold cursor-pointer hover:text-white/75 transition-colors">
        <User size={20} />
        <span>我的世界</span>
      </button>
    </nav>
  );
}
