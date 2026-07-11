"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent } from "react";
import { useLocalGameRuntime } from "../runtime/useLocalGameRuntime";
import AssetStudio from './AssetStudio';

type Phase = "world" | "building" | "play" | "assets";
type Drawer = "mutate" | null;

const chips = ["RACCOON", "BOSS FIGHT", "CO-OP", "BAD LUCK", "OFFICE", "GIANT CHICKEN"];
const buildSteps = [
  ["WORKSHOP", "Understanding the game in your idea."],
  ["DUNGEON", "Compiling the world and its rules."],
  ["THE EYE", "Playtesting the generated experience."],
  ["LAUNCH BAY", "Committing a complete playable release."],
];

function runtimeBuildStep(stageId?: string) {
  if (!stageId) return 0;
  if (["understanding", "directing"].includes(stageId)) return 0;
  if (["compiling", "building"].includes(stageId)) return 1;
  if (["runtime", "packaging", "playtesting"].includes(stageId)) return 2;
  if (stageId === "complete") return 3;
  return 0;
}

const castleKeyArtUrl = `${import.meta.env.BASE_URL}castle-keyart-v2.png`;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function appPath(path: string) {
  return `${basePath}${path}`;
}

function currentAppPath() {
  const { pathname } = window.location;
  return basePath && pathname.startsWith(`${basePath}/`) ? pathname.slice(basePath.length) : pathname;
}

function gameName(idea: string) {
  const words = idea.replace(/[^a-zA-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean).slice(0, 3);
  return words.length ? words.join(" ").toUpperCase() : "A SMALL DISASTER";
}

export default function GameCastleExperience() {
  const runtime = useLocalGameRuntime();
  const [assetsReady, setAssetsReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState(8);
  const [phase, setPhase] = useState<Phase>("world");
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [idea, setIdea] = useState("A raccoon steals a police car and escapes through a supermarket.");
  const [lever, setLever] = useState(0);
  const [runError, setRunError] = useState("");
  const startY = useRef<number | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const submitting = useRef(false);

  const title = useMemo(() => gameName(idea), [idea]);
  const buildStep = runtimeBuildStep(runtime.snapshot?.stage.id);
  const playableUrl = runtime.snapshot?.artifact?.playUrl ?? null;

  useEffect(() => {
    let active = true;
    let finished = 0;
    const markReady = () => {
      if (!active) return;
      finished += 1;
      setLoadProgress(Math.round((finished / 3) * 100));
      if (finished === 3) window.setTimeout(() => active && setAssetsReady(true), 180);
    };

    const keyArt = new Image();
    keyArt.onload = markReady;
    keyArt.onerror = markReady;
    keyArt.src = castleKeyArtUrl;
    void Promise.resolve(document.fonts?.ready).then(markReady);
    const minimumTime = window.setTimeout(markReady, 620);

    return () => {
      active = false;
      window.clearTimeout(minimumTime);
    };
  }, []);

  useEffect(() => {
    const setFromPath = () => {
      const pathname = currentAppPath();
      if (pathname.startsWith("/play/")) setPhase("play");
      else if (pathname.startsWith("/build/")) setPhase("building");
      else if (pathname === '/assets') setPhase('assets'); else setPhase("world");
    };
    setFromPath();
    window.addEventListener("popstate", setFromPath);
    return () => window.removeEventListener("popstate", setFromPath);
  }, []);

  useEffect(() => {
    const snapshot = runtime.snapshot;
    if (!snapshot) return;
    if (snapshot.status === "running" || snapshot.status === "cancelling") {
      submitting.current = true;
      setRunError("");
      setPhase("building");
      return;
    }
    submitting.current = false;
    if (snapshot.status === "succeeded" && snapshot.artifact && phase === "building") {
      setRunError("");
      setPhase("play");
      const nextPath = appPath(`/play/${snapshot.artifact.version}`);
      if (window.location.pathname !== nextPath) window.history.pushState({}, "", nextPath);
      return;
    }
    if ((snapshot.status === "failed" || snapshot.status === "cancelled") && phase === "building") {
      setRunError(snapshot.error?.message ?? "The castle could not finish this build.");
    }
  }, [runtime.snapshot, phase]);

  async function startBuild() {
    if (phase !== "world" || submitting.current) return;
    submitting.current = true;
    setLever(100);
    setRunError("");
    clank(true);
    setPhase("building");
    setDrawer(null);
    window.history.pushState({}, "", appPath("/build/new-game"));
    try {
      await runtime.run(idea, "create");
    } catch (error) {
      submitting.current = false;
      setRunError(error instanceof Error ? error.message : "The Local Game Runtime could not start.");
    }
  }

  function pullStart(event: ReactPointerEvent<HTMLButtonElement>) {
    startY.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pullMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (startY.current === null) return;
    const next = Math.max(0, Math.min(100, (event.clientY - startY.current) * 1.1));
    setLever(next);
    if (next > 72) void startBuild();
  }

  function pullEnd() { startY.current = null; setLever((value) => value > 72 ? value : 0); }

  function clank(heavy = false) {
    if (typeof window === "undefined") return;
    try {
      const context = audioContext.current ?? new window.AudioContext();
      audioContext.current = context;
      if (context.state === "suspended") void context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(heavy ? 105 : 145, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(heavy ? 54 : 72, context.currentTime + 0.08);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(heavy ? 0.075 : 0.045, context.currentTime + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.105);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.12);
    } catch { /* Audio is an enhancement; the machine still runs silently. */ }
  }

  function addChip(chip: string) {
    setIdea((value) => value.toUpperCase().includes(chip) ? value : `${value.trim()} ${chip}`.trim());
  }

  function submit(event: FormEvent) { event.preventDefault(); void startBuild(); }

  async function applyChange(request: string) {
    const clean = request.trim();
    if (!clean || submitting.current) return;
    submitting.current = true;
    setIdea(clean);
    setRunError("");
    setDrawer(null);
    setPhase("building");
    window.history.pushState({}, "", appPath("/build/continue"));
    try {
      await runtime.run(clean, "continue");
    } catch (error) {
      submitting.current = false;
      setRunError(error instanceof Error ? error.message : "The Local Game Runtime could not start the change.");
    }
  }

  function goHome() { setPhase("world"); setDrawer(null); setRunError(""); window.history.pushState({}, "", appPath("/")); }
  function openAssets() { setPhase('assets'); window.history.pushState({}, '', appPath('/assets')); }

  const appStyle = {
    "--castle-keyart": `url("${castleKeyArtUrl}")`,
  } as CSSProperties & Record<"--castle-keyart", string>;

  const drawerView = drawer ? <Drawer
    onClose={() => setDrawer(null)}
    onChangeIntent={applyChange}
  /> : null;

  if (!assetsReady) return <main className="load-screen" aria-live="polite">
    <div className="load-sky"><i /><i /><i /></div>
    <section className="load-card">
      <div className="load-logo"><span>▥</span> GameCastle</div>
      <p>OPENING THE WORLD</p>
      <h1>Ideas are<br />almost playable.</h1>
      <div className="load-track"><i style={{ width: `${loadProgress}%` }} /></div>
      <div className="load-meta"><b>{String(loadProgress).padStart(3, "0")}%</b><span>LOADING WORLD LAYERS</span></div>
    </section>
  </main>;

  if (phase === 'assets') return <AssetStudio onClose={goHome} />;
  return <main className={`gc-app gc-${phase}`} style={appStyle}>
    {phase === "world" && <section className="world-screen">
      <div className="key-art" aria-hidden="true" />
      <div className="art-wash" aria-hidden="true" />
      <div className="world-weather" aria-hidden="true"><span className="cloud cloud-a" /><span className="cloud cloud-b" /><span className="cloud cloud-c" /></div>
      <div className="world-machinery" aria-hidden="true"><span className="ambient-gear gear-one">✳</span><span className="ambient-gear gear-two">✳</span></div>
      <header className="world-head">
        <button className="gc-logo" type="button" onClick={() => setDrawer(null)}><span>▥</span> GameCastle</button><button className="asset-entry" type="button" onClick={openAssets}>资产工作台</button>
      </header>

      <div className="hero-copy">
        <p className="eyebrow"><i /> A PLACE FOR UNREASONABLE GAMES</p>
        <h1>MAKE A GAME.<br /><span>MAKE IT WEIRD.</span></h1>
        <p className="hero-note">One thought. The castle does the rest.</p>
      </div>

      <form className="idea-console" onSubmit={submit}>
        <div className="console-top"><span>WHAT ARE WE MAKING?</span><button type="button" onClick={() => setIdea("")} aria-label="Clear idea">×</button></div>
        <textarea value={idea} onChange={(event) => setIdea(event.target.value)} rows={3} placeholder="A pigeon runs a haunted hotel..." />
        <div className="console-bottom"><div className="chip-strip">{chips.map((chip) => <button type="button" onClick={() => addChip(chip)} key={chip}>{chip}</button>)}</div><button className="surprise" type="button" onClick={() => setIdea("A tired wizard runs a late-night drive-thru for ghosts.")}>?</button></div>
        <button className="build-button" type="submit" disabled={runtime.isRunning || !idea.trim()}>MAKE IT <b>→</b></button>
        <button className="pull-control" type="button" disabled={runtime.isRunning || !idea.trim()} onPointerDown={pullStart} onPointerMove={pullMove} onPointerUp={pullEnd} onPointerCancel={pullEnd} onClick={() => void startBuild()} aria-label="Pull to make it"><span>PULL</span><i><em style={{ transform: `translateY(${Math.min(lever, 67)}px)` }} /></i></button>
      </form>
      <p className="pull-copy">PULL DOWN OR TAP MAKE IT</p>
      {runtime.connectionError && <p className="runtime-inline-error">RUNTIME OFFLINE · {runtime.connectionError}</p>}

      {drawerView}
    </section>}

    {phase === "building" && <section className="build-screen" aria-live="polite">
      <div className="build-art" aria-hidden="true" />
      <div className="build-portal" aria-hidden="true" />
      <div className="build-machinery" aria-hidden="true"><span className="build-gear build-gear-a">✳</span><span className="build-gear build-gear-b">✳</span><span className="machine-word word-a">KCHUNK</span><span className="machine-word word-b">CLANK</span></div>
      {!runError && <div className="build-copy"><p>{runtime.snapshot?.stage.label.toUpperCase() ?? "THE CASTLE IS ON IT."}</p><h2>{buildSteps[buildStep][1]}</h2><div className="build-path">{buildSteps.map(([label], index) => <span key={label} className={index <= buildStep ? "done" : ""}><i>{index + 1}</i>{label}</span>)}</div>{runtime.canCancel && <button className="cancel-build" type="button" onClick={() => void runtime.cancel()}>STOP BUILD</button>}</div>}
      {runError && <div className="runtime-failure"><p>THE BUILD STOPPED</p><h2>{runError}</h2><div><button type="button" onClick={goHome}>BACK TO THE CASTLE</button>{playableUrl && <button type="button" onClick={() => { setRunError(""); setPhase("play"); window.history.pushState({}, "", appPath(`/play/${runtime.snapshot?.artifact?.version ?? "current"}`)); }}>KEEP PLAYING LAST VERSION</button>}</div></div>}
      <p className="build-idea">“{idea}”</p>
    </section>}

    {phase === "play" && <section className="play-screen">
      <header className="play-head"><button type="button" onClick={goHome}>✦ GameCastle</button><strong>{title}</strong><span>{runtime.snapshot?.artifact?.semanticHash ? `WORLD ${runtime.snapshot.artifact.worldVersion}` : "LIVE"}</span></header>
      <div className="game-world real-game-world">
        {playableUrl ? <iframe key={runtime.snapshot?.artifact?.version} src={playableUrl} title={`Playable game: ${title}`} sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms" /> : <div className="play-unavailable"><strong>NO PLAYABLE RELEASE</strong><button type="button" onClick={goHome}>BUILD A GAME</button></div>}
      </div>
      <nav className="play-dock"><button type="button" onClick={() => setDrawer("mutate")}>CHANGE THIS GAME</button><button type="button" onClick={openAssets}>资产工作台</button></nav>
      {drawerView}
    </section>}
  </main>;
}

function Drawer({
  onClose,
  onChangeIntent,
}: {
  onClose: () => void;
  onChangeIntent: (request: string) => void;
}) {
  const [request, setRequest] = useState("");
  return <aside className="game-drawer drawer-mutate">
    <button className="drawer-x" type="button" onClick={onClose}>×</button>
    <p className="drawer-kicker">CHANGE THE RULES</p><h2>What should<br />change next?</h2><form className="change-form" onSubmit={(event) => { event.preventDefault(); onChangeIntent(request); }}><textarea value={request} onChange={(event) => setRequest(event.target.value)} rows={3} placeholder="The boss should throw office chairs." /><button type="submit">CHANGE IT <b>→</b></button></form><p className="suggestion-label">OR START HERE</p><div className="change-suggestions"><button type="button" onClick={() => setRequest("The boss should throw office chairs.")}>BOSS THROWS CHAIRS</button><button type="button" onClick={() => setRequest("Make the whole game much faster.")}>TOO FAST</button><button type="button" onClick={() => setRequest("Add more enemies near the end.")}>MORE ENEMIES</button></div>
  </aside>;
}
