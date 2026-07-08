import { Puzzle, GitBranch, Network, Rocket } from "lucide-react";

const caps = [
  { icon: Puzzle,    color: "#4ade80", bg: "rgba(74,222,128,0.12)",  border: "rgba(74,222,128,0.25)",  title: "模块化能力", desc: "玩法、对象、规则、资源和界面都能自由组合，像搭积木一样构建你的游戏世界。" },
  { icon: GitBranch, color: "#fbbf24", bg: "rgba(251,191,36,0.12)",  border: "rgba(251,191,36,0.25)",  title: "持续迭代",   desc: "每一次修改都会成为项目新版本，而不是重新生成。你的世界会不断生长。" },
  { icon: Network,   color: "#a855f7", bg: "rgba(168,85,247,0.12)",  border: "rgba(168,85,247,0.25)",  title: "未来联机",   desc: "支持房间、会话、同步策略和权威状态边界，让游戏世界向多人开放。" },
  { icon: Rocket,    color: "#38bdf8", bg: "rgba(56,189,248,0.12)",  border: "rgba(56,189,248,0.25)",  title: "一键发布",   desc: "输出可运行网页游戏，支持平台试玩与分享，让你的创意触达真实玩家。" },
];

export default function CapabilitySection() {
  return (
    <section className="scroll-snap-section min-h-screen relative overflow-hidden"
      style={{ background: "linear-gradient(180deg, #0f2040 0%, #0a1830 50%, #0f2040 100%)" }}>
      <div className="relative z-10 px-5 py-7">
        <h2 className="text-[26px] font-extrabold text-center leading-snug mb-2">
          <span className="bg-gradient-to-r from-go via-sg to-go bg-clip-text text-transparent">不是模板生成</span>，是世界生长
        </h2>
        <p className="text-sm text-white/75 text-center max-w-[300px] mx-auto mb-7 leading-relaxed">
          GameCastle 不是一次性生成死板的模板游戏。每个项目都是活的，持续进化。
        </p>

        <div className="flex flex-col gap-3">
          {caps.map((c, i) => {
            const Icon = c.icon;
            return (
              <div key={i} className="relative bg-white/4 border rounded-2xl p-[18px] glass overflow-hidden
                hover:bg-white/8 transition-all"
                style={{
                  borderColor: c.border,
                  animation: `card-rise 0.5s cubic-bezier(0.22,0.61,0.36,1) ${i * 0.1}s both`,
                }}>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: c.bg, color: c.color }}>
                  <Icon size={24} />
                </div>
                <h3 className="text-base font-bold text-white mb-1.5">{c.title}</h3>
                <p className="text-[13px] text-white/45 leading-relaxed">{c.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
