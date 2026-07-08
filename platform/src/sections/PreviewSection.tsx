import { Sparkles, Swords, Coins, Users, Mountain } from "lucide-react";

const suggestions = [
  { icon: Swords,  color: "#f87171", text: "加入一个 Boss" },
  { icon: Coins,   color: "#fbbf24", text: "让金币更密集" },
  { icon: Users,   color: "#a855f7", text: "把单人模式升级为房间对战" },
  { icon: Mountain,color: "#4ade80", text: "新增一张雪山关卡" },
];

export default function PreviewSection() {
  return (
    <section className="scroll-snap-section min-h-screen relative overflow-hidden"
      style={{ background: "linear-gradient(180deg, #0f2040 0%, #162d55 50%, #1a3560 100%)" }}>
      <div className="relative z-10 px-5 py-7">
        <h2 className="text-[26px] font-extrabold text-center leading-snug mb-2">
          <span className="bg-gradient-to-r from-go via-sg to-go bg-clip-text text-transparent">边玩，边改</span>，边生长
        </h2>
        <p className="text-sm text-white/75 text-center max-w-[300px] mx-auto mb-7 leading-relaxed">
          游戏不是一次性产物。试玩、反馈、修改、扩展，形成持续生长的循环。
        </p>

        {/* Game Preview Screen */}
        <div className="bg-[#1a2a44] rounded-2xl border-2 border-white/10 overflow-hidden relative aspect-video
          shadow-[0_8px_32px_rgba(0,0,0,0.3),0_0_40px_rgba(56,189,248,0.06)] mb-4">
          <div className="w-full h-full relative overflow-hidden"
            style={{ background: "linear-gradient(180deg, #1a3a5c 0%, #2a5080 40%, #3d5a3c 80%, #4a6a44 100%)" }}>
            {/* Platforms */}
            <div className="preview-platform absolute bottom-[40%] left-[10%]" style={{ width: "40%", height: 10 }} />
            <div className="preview-platform absolute bottom-[25%] right-[15%]" style={{ width: "30%", height: 10 }} />
            <div className="preview-platform absolute bottom-[10%] left-[20%] rounded-md" style={{ width: "60%", height: 12 }} />

            {/* Player */}
            <div className="absolute flex flex-col items-center" style={{ bottom: "calc(10% + 12px)", left: "45%", animation: "player-bob 1.5s ease-in-out infinite" }}>
              <div className="preview-player-head mb-px" />
              <div className="preview-player-body" />
            </div>

            {/* Coins */}
            <span className="absolute text-sm" style={{ bottom: "calc(40% + 12px)", left: "20%", animation: "coin-bounce 2s ease-in-out infinite" }}>🪙</span>
            <span className="absolute text-sm" style={{ bottom: "calc(40% + 12px)", left: "35%", animation: "coin-bounce 2s ease-in-out 0.6s infinite" }}>🪙</span>
            <span className="absolute text-sm" style={{ bottom: "calc(25% + 12px)", right: "25%", animation: "coin-bounce 2s ease-in-out 1.2s infinite" }}>🪙</span>

            {/* Enemy */}
            <div className="absolute flex flex-col items-center" style={{ bottom: "calc(40% + 12px)", left: "58%", animation: "enemy-walk 3s ease-in-out infinite" }}>
              <div className="preview-enemy-body" />
              <div className="preview-enemy-eye" style={{ marginTop: -10 }} />
            </div>

            {/* Boss */}
            <div className="absolute flex flex-col items-center opacity-70" style={{ bottom: "calc(10% + 12px)", right: "10%", animation: "boss-idle 4s ease-in-out infinite" }}>
              <span className="text-xs" style={{ marginBottom: -4 }}>👑</span>
              <div className="preview-boss-body" />
            </div>

            {/* Multiplayer badge */}
            <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-xl bg-black/50 text-go text-[10px] font-bold border border-go/30 glass">
              <Users size={10} /><span>2/4</span>
            </div>

            {/* Labels */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2">
              <span className="px-2.5 py-0.5 rounded-xl bg-black/55 text-white/75 text-[10px] font-semibold border border-white/10 glass whitespace-nowrap">🎮 可试玩</span>
              <span className="px-2.5 py-0.5 rounded-xl bg-black/55 text-white/75 text-[10px] font-semibold border border-white/10 glass whitespace-nowrap">🔄 可迭代</span>
              <span className="px-2.5 py-0.5 rounded-xl bg-black/55 text-white/75 text-[10px] font-semibold border border-white/10 glass whitespace-nowrap">🌐 可联机</span>
            </div>
          </div>
        </div>

        {/* AI Suggestions */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-[13px] font-bold text-go mb-0.5">
            <Sparkles size={14} />
            <span>AI 修改建议</span>
          </div>
          {suggestions.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/8 glass cursor-pointer
                hover:bg-white/10 hover:border-white/15 transition-all text-[13px] text-white/75"
                style={{ animation: `card-rise 0.5s cubic-bezier(0.22,0.61,0.36,1) ${i * 0.1}s both` }}>
                <div className="w-7 h-7 rounded-lg bg-white/6 flex items-center justify-center shrink-0" style={{ color: s.color }}>
                  <Icon size={16} />
                </div>
                <span>{s.text}</span>
                <span className="ml-auto text-white/45 text-sm">→</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
