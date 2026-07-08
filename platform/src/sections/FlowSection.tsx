import { Lightbulb, Brain, Puzzle, Code, Play, RefreshCw } from "lucide-react";

const steps = [
  { icon: Lightbulb, color: "#fbbf24", bg: "rgba(251,191,36,0.1)", title: "创意描述", desc: "用户说出世界设定、玩法和体验目标" },
  { icon: Brain,       color: "#a855f7", bg: "rgba(168,85,247,0.1)", title: "AI 设计规划", desc: "拆解玩法、角色、规则和体验变化" },
  { icon: Puzzle,      color: "#4ade80", bg: "rgba(74,222,128,0.1)", title: "模块能力组合", desc: "选择平台跳跃、金币、敌人、Boss、UI、关卡等模块" },
  { icon: Code,        color: "#38bdf8", bg: "rgba(56,189,248,0.1)", title: "确定性编译", desc: "Module DSL 编译成可执行项目补丁" },
  { icon: Play,        color: "#f472b6", bg: "rgba(244,114,182,0.1)", title: "实时试玩", desc: "生成 project.json + game.html，浏览器立即运行" },
  { icon: RefreshCw,   color: "#fb923c", bg: "rgba(251,146,60,0.1)", title: "持续迭代", desc: "后续请求以 patch 修改项目状态" },
];

export default function FlowSection() {
  return (
    <section className="scroll-snap-section min-h-screen relative overflow-hidden"
      style={{ background: "linear-gradient(180deg, #234a80 0%, #1a3560 30%, #0f2040 100%)" }}>
      <div className="relative z-10 px-5 py-7">
        <h2 className="text-[26px] font-extrabold text-center leading-snug mb-2">
          从想法<span className="bg-gradient-to-r from-go via-sg to-go bg-clip-text text-transparent">，到可玩的世界</span>
        </h2>
        <p className="text-sm text-white/75 text-center max-w-[300px] mx-auto mb-7 leading-relaxed">
          GameCastle 将你的创意描述转化为确定性的游戏项目，每一步都可控、可回溯、可持续生长。
        </p>

        <div className="grid grid-cols-2 gap-3">
          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="relative bg-white/5 border border-white/8 rounded-2xl p-4 glass overflow-hidden
                hover:bg-white/10 hover:border-white/15 hover:-translate-y-0.5 transition-all"
                style={{ animation: `card-rise 0.5s cubic-bezier(0.22,0.61,0.36,1) ${i * 0.08}s both` }}>
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                <div className="text-[11px] font-bold text-white/18 mb-1.5 tracking-wider">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2.5"
                  style={{ background: s.bg, color: s.color }}>
                  <Icon size={20} />
                </div>
                <h3 className="text-sm font-bold text-white mb-1">{s.title}</h3>
                <p className="text-xs text-white/45 leading-relaxed">{s.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
