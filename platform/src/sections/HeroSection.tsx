import { useState } from "react";
import { Menu, Sparkles } from "lucide-react";

const particles = Array.from({ length: 12 }, (_, i) => ({
  left: Math.random() * 100 + "%",
  top: Math.random() * 70 + "%",
  delay: Math.random() * 4 + "s",
  dur: 3 + Math.random() * 4 + "s",
  w: 2 + Math.random() * 4 + "px",
  h: 2 + Math.random() * 4 + "px",
}));

export default function HeroSection() {
  const [text] = useState(
    "我想做一个会不断扩展的多人平台冒险世界，有金币、敌人、Boss 和玩家房间。"
  );

  return (
    <section className="scroll-snap-section relative min-h-screen flex items-center justify-center overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #060e1f 0%, #0a1830 15%, #0f2040 30%, #162d55 50%, #1a3560 70%, #1e3d6e 85%, #234a80 100%)",
      }}
    >
      {/* ── Sky Layer ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="hero-stars absolute inset-0" />

        {/* Clouds */}
        <div className="cloud cloud-1 absolute top-[14%] -left-[8%] opacity-40" />
        <div className="cloud cloud-2 absolute top-[22%] right-[3%] opacity-35" />
        <div className="cloud cloud-3 absolute top-[30%] left-[25%] opacity-28" />
        <div className="cloud cloud-4 absolute top-[38%] -right-[2%] opacity-22" />

        {/* Left floating island */}
        <div className="absolute -left-6 bottom-[6%]">
          <div className="island-base relative">
            <div className="island-grass absolute -top-2.5 left-0" />
          </div>
          <div className="tree absolute bottom-[34px] left-8" />
        </div>

        {/* Right floating island + castle */}
        <div className="absolute -right-[34px] bottom-[10%]">
          <div className="island-base relative">
            <div className="island-grass absolute -top-2.5 left-0" />
          </div>
          <div className="absolute bottom-[22px] left-[14px] flex items-end gap-0">
            <div className="castle-tower" style={{ height: 54 }} />
            <div className="castle-wall" />
            <div className="castle-tower" style={{ height: 48 }} />
            <div className="castle-tower relative" style={{ height: 48 }}>
              <div className="castle-flag absolute" style={{ top: -56, left: 6 }} />
            </div>
            <div className="castle-gate absolute bottom-0" style={{ left: 32 }} />
          </div>
        </div>

        {/* Distant islands */}
        <div className="distant-island absolute bottom-[50px] -left-[8%]" style={{ width: 200, height: 44 }} />
        <div className="distant-island absolute bottom-[90px] right-[8%]" style={{ width: 130, height: 32 }} />
        <div className="distant-island absolute bottom-[70px] left-[48%] -translate-x-1/2" style={{ width: 110, height: 26 }} />

        {/* Gold particles */}
        {particles.map((p, i) => (
          <div key={i} className="absolute rounded-full bg-go"
            style={{
              left: p.left, top: p.top, width: p.w, height: p.h,
              animation: `particle-float ${p.dur} linear ${p.delay} infinite`,
              opacity: 0.5, boxShadow: "0 0 6px rgba(251,191,36,0.5)",
            }} />
        ))}
      </div>

      {/* ── Content ── */}
      <div className="relative z-10 w-full px-6 pb-10 flex flex-col items-center text-center">
        {/* Top bar */}
        <div className="flex items-center justify-between w-full mb-6">
          <button className="w-[38px] h-[38px] rounded-xl bg-white/8 border border-white/10 text-white/75 flex items-center justify-center glass hover:bg-white/15 hover:text-white transition-colors">
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-2xl drop-shadow-[0_2px_6px_rgba(251,191,36,0.5)]">🏰</span>
            <span className="text-[19px] font-extrabold tracking-wider text-white drop-shadow-[0_2px_10px_rgba(168,85,247,0.35)]">
              GameCastle
            </span>
          </div>
          <div className="w-[38px]" />
        </div>

        {/* Tag */}
        <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-pu/12 border border-pu/20 text-sp text-xs font-semibold mb-5 glass">
          <Sparkles size={14} className="text-go" />
          <span>AI 驱动的可联机游戏世界工厂</span>
        </div>

        {/* Title */}
        <h1 className="text-[34px] font-black leading-tight tracking-wider mb-3"
          style={{
            background: "linear-gradient(180deg, #fff 0%, #d0ddf0 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.3))",
          }}>
          让创意照进现实
        </h1>

        {/* Subtitle */}
        <p className="text-[15px] text-white/75 font-medium leading-relaxed max-w-[270px] mb-6"
          style={{ textShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
          AI 导演与你协作，持续塑造你的游戏世界
        </p>

        {/* Input box */}
        <div className="relative w-full max-w-[326px] mb-5">
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-white/7 border border-white/15 glass"
            style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.25), 0 0 24px rgba(168,85,247,0.06)" }}>
            <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-pu to-indigo-500 flex items-center justify-center text-[17px] shrink-0">
              🧑‍🚀
            </div>
            <div className="flex-1 text-[13px] text-white/75 text-left leading-relaxed overflow-hidden">
              {text}
            </div>
            <div className="w-2 h-4 bg-go rounded-sm shrink-0" style={{ animation: "blink 1s step-end infinite" }} />
          </div>
          <div className="absolute -top-2.5 -right-1.5 w-[30px] h-[30px] rounded-full bg-gradient-to-br from-go to-amber-500 flex items-center justify-center text-white shadow-[0_4px_14px_rgba(251,191,36,0.35)]"
            style={{ animation: "sparkle-pulse 2s ease-in-out infinite" }}>
            <Sparkles size={14} />
          </div>
        </div>

        {/* CTAs */}
        <div className="flex flex-col gap-2.5 w-full max-w-[280px] mb-5">
          <button className="flex items-center justify-center gap-2 py-3.5 px-8 rounded-2xl border-0 text-base font-bold text-db tracking-wider cursor-pointer
            bg-gradient-to-r from-go via-amber-500 to-sg
            shadow-[0_4px_22px_rgba(251,191,36,0.35),0_8px_36px_rgba(251,191,36,0.12)]
            hover:-translate-y-0.5 hover:shadow-[0_6px_28px_rgba(251,191,36,0.45)]
            active:translate-y-0 transition-all">
            <Sparkles size={16} />
            <span>开始塑造世界</span>
          </button>
          <button className="flex items-center justify-center gap-1.5 py-3 px-7 rounded-2xl border border-white/20 bg-white/5 text-white/75 text-sm font-semibold cursor-pointer glass hover:bg-white/12 hover:border-white/30 hover:text-white transition-all">
            <span>查看能力模块</span>
            <span className="text-xs">↓</span>
          </button>
        </div>

        {/* Scroll hint */}
        <div className="flex flex-col items-center gap-1 text-white/45 text-xs" style={{ animation: "hint-float 2s ease-in-out infinite" }}>
          <span>向下探索</span>
        </div>
      </div>
    </section>
  );
}
