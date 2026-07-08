import { Sparkles, ArrowRight, Sprout, Gamepad2, Swords, Crown, Users, Rocket, MessageCircle, Infinity } from "lucide-react";

const steps = [
  { icon: Sprout,       color: "#4ade80", label: "想法种子" },
  { icon: Gamepad2,       color: "#38bdf8", label: "核心玩法" },
  { icon: Swords,         color: "#f87171", label: "角色与敌人" },
  { icon: Crown,          color: "#fbbf24", label: "关卡与 Boss" },
  { icon: Users,          color: "#a855f7", label: "联机房间" },
  { icon: Rocket,         color: "#fb923c", label: "发布与分享" },
  { icon: MessageCircle,  color: "#f472b6", label: "玩家反馈" },
  { icon: Infinity,   color: "#4ade80", label: "AI 继续扩展" },
];

export default function GrowthSection() {
  return (
    <section className="scroll-snap-section min-h-screen relative overflow-hidden pb-[100px]"
      style={{ background: "linear-gradient(180deg, #1a3560 0%, #0f2040 40%, #0a1628 100%)" }}>
      <div className="relative z-10 px-5 py-7">
        <h2 className="text-[26px] font-extrabold text-center leading-snug mb-2">
          你的游戏，<span className="bg-gradient-to-r from-go via-sg to-go bg-clip-text text-transparent">不会停在第一版</span>
        </h2>
        <p className="text-sm text-white/75 text-center max-w-[300px] mx-auto mb-7 leading-relaxed">
          从一颗想法的种子开始，在 AI 的陪伴下持续生长，直到变成一个完整、可玩的游戏世界。
        </p>

        {/* Timeline */}
        <div className="relative py-4 mb-0">
          <div className="absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2"
            style={{ background: "linear-gradient(180deg, rgba(74,222,128,0.5) 0%, rgba(56,189,248,0.5) 25%, rgba(168,85,247,0.5) 50%, rgba(251,191,36,0.5) 75%, rgba(74,222,128,0.5) 100%)" }} />

          {steps.map((s, i) => {
            const Icon = s.icon;
            const isLeft = i % 2 === 0;
            return (
              <div key={i} className={`flex items-center mb-3.5 relative ${isLeft ? "flex-row pr-[50%]" : "flex-row-reverse pl-[50%]"}`}
                style={{ animation: `card-rise 0.5s cubic-bezier(0.22,0.61,0.36,1) ${i * 0.12}s both` }}>
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center z-10 shadow-[0_0_12px_rgba(0,0,0,0.3)]"
                  style={{ background: s.color }}>
                  <Icon size={14} color="#fff" />
                </div>
                <div className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/8 glass max-w-[140px] flex items-center gap-1.5">
                  <span className="text-[13px] font-bold text-white whitespace-nowrap">{s.label}</span>
                  {i < steps.length - 1 && <ArrowRight size={12} style={{ color: s.color }} />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Closing */}
        <div className="text-center my-6 p-4 rounded-2xl bg-pu/6 border border-pu/10">
          <p className="text-sm text-white/75 leading-relaxed">
            GameCastle 让每个创意都有机会变成一个真实、可玩、会生长的游戏世界。
          </p>
        </div>

        {/* Bottom CTA */}
        <div className="flex flex-col items-center gap-2 mt-2">
          <button className="flex items-center justify-center gap-2 py-3.5 px-9 rounded-2xl border-0 text-base font-bold text-db cursor-pointer
            bg-gradient-to-r from-go to-amber-500 shadow-[0_4px_20px_rgba(251,191,36,0.3)]
            hover:-translate-y-0.5 hover:shadow-[0_6px_24px_rgba(251,191,36,0.4)] transition-all tracking-wider">
            <Sparkles size={18} />
            <span>开始塑造我的世界</span>
          </button>
          <p className="text-xs text-white/45">无需安装 · 浏览器即玩 · 持续更新</p>
        </div>
      </div>
    </section>
  );
}
