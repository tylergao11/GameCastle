"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent } from "react";
import DirectorEye from "../components/DirectorEye";

type Phase = "world" | "building" | "play";
type Drawer = "remix" | "director" | "friends" | "share" | "mutate" | null;

type DirectorIdea = {
  id: string;
  type: string;
  line: string;
  chaos: number;
};

const chips = ["RACCOON", "BOSS FIGHT", "CO-OP", "BAD LUCK", "OFFICE", "GIANT CHICKEN"];
const blueprints = [
  { title: "CHICKEN PROBLEM", line: "Two chickens break out of a very bad farm.", tone: "red", emoji: "🐔" },
  { title: "SHARK MALL", line: "The mall is flooded. The sharks are shopping.", tone: "blue", emoji: "🦈" },
  { title: "CART RACERS", line: "Shopping carts race through a sleeping city.", tone: "yellow", emoji: "🛒" },
];
const directorIdeas: DirectorIdea[] = [
  { id: "lying-safe-object", type: "RULE REVERSAL", line: "Halfway through, the safest object starts lying to the player.", chaos: 1 },
  { id: "weakest-guide", type: "CHARACTER WILL", line: "The weakest enemy becomes the only character who knows the real exit.", chaos: 1 },
  { id: "false-victory", type: "STORY INTERRUPTION", line: "Show a fake victory screen just before the real final challenge begins.", chaos: 2 },
  { id: "memory-boss", type: "DIRECTOR MEMORY", line: "The boss remembers one move from the previous run and prepares a counter.", chaos: 2 },
  { id: "celebration-gravity", type: "WORLD EVENT", line: "Whenever somebody celebrates, gravity briefly changes direction.", chaos: 2 },
  { id: "secret-ally", type: "CASTING CHANGE", line: "One ordinary prop secretly becomes a playable ally near the end.", chaos: 1 },
];
const buildSteps = [
  ["WORKSHOP", "Finding the game in your idea."],
  ["DUNGEON", "Making something chase you."],
  ["THE EYE", "Watching for boring parts."],
  ["LAUNCH BAY", "Opening the game."],
];

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
  const [assetsReady, setAssetsReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState(8);
  const [phase, setPhase] = useState<Phase>("world");
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [idea, setIdea] = useState("A raccoon steals a police car and escapes through a supermarket.");
  const [lever, setLever] = useState(0);
  const [buildStep, setBuildStep] = useState(0);
  const [remixSource, setRemixSource] = useState<string | null>(null);
  const [chaos, setChaos] = useState(0);
  const [score, setScore] = useState(164);
  const [jumping, setJumping] = useState(false);
  const [toast, setToast] = useState("");
  const [lastChange, setLastChange] = useState("");
  const [directorProposal, setDirectorProposal] = useState<DirectorIdea>(directorIdeas[0]);
  const [directorTwist, setDirectorTwist] = useState<DirectorIdea | null>(null);
  const startY = useRef<number | null>(null);
  const audioContext = useRef<AudioContext | null>(null);

  const title = useMemo(() => gameName(idea), [idea]);

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
      else setPhase("world");
    };
    setFromPath();
    window.addEventListener("popstate", setFromPath);
    return () => window.removeEventListener("popstate", setFromPath);
  }, []);

  useEffect(() => {
    if (phase !== "building") return;
    const stepTimer = window.setInterval(() => {
      setBuildStep((step) => Math.min(step + 1, buildSteps.length - 1));
      clank();
    }, 850);
    const launchTimer = window.setTimeout(() => {
      setPhase("play");
      window.history.pushState({}, "", appPath("/play/first-run"));
    }, 3900);
    return () => { window.clearInterval(stepTimer); window.clearTimeout(launchTimer); };
  }, [phase]);

  useEffect(() => {
    if (phase !== "play") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "Space" || event.code === "ArrowUp") { event.preventDefault(); jump(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function startBuild() {
    if (phase !== "world") return;
    setLever(100);
    setBuildStep(0);
    clank(true);
    window.setTimeout(() => {
      setPhase("building");
      setDrawer(null);
      window.history.pushState({}, "", appPath("/build/new-game"));
    }, 210);
  }

  function pullStart(event: ReactPointerEvent<HTMLButtonElement>) {
    startY.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pullMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (startY.current === null) return;
    const next = Math.max(0, Math.min(100, (event.clientY - startY.current) * 1.1));
    setLever(next);
    if (next > 72) startBuild();
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

  function chooseBlueprint(blueprint: (typeof blueprints)[number]) {
    setRemixSource(blueprint.title);
    setIdea(`${blueprint.line} But now make it ${blueprint.title === "SHARK MALL" ? "co-op" : "weirder"}.`);
    setDrawer(null);
    setToast("BLUEPRINT STOLEN. MAKE IT YOURS.");
  }

  function submit(event: FormEvent) { event.preventDefault(); startBuild(); }

  function jump() {
    if (jumping || phase !== "play") return;
    setJumping(true);
    setScore((value) => value + 8 + chaos * 2);
    window.setTimeout(() => setJumping(false), 470);
  }

  function makeChaotic(level: number, message: string) {
    setChaos(level);
    setDrawer(null);
    setToast(message);
  }

  function applyChange(request: string) {
    const clean = request.trim();
    if (!clean) return;
    const lower = clean.toLowerCase();
    const nextChaos = lower.includes("chair") || lower.includes("boss") ? 1 : lower.includes("fast") || lower.includes("more") || lower.includes("enemy") ? 2 : 1;
    setChaos((value) => Math.max(value, nextChaos));
    setLastChange(clean);
    setDrawer(null);
    setToast(`CHANGED: ${clean.slice(0, 42).toUpperCase()}${clean.length > 42 ? "…" : ""}`);
  }

  function toggleDirector() {
    if (drawer === "director") {
      setDrawer(null);
      return;
    }

    setDirectorProposal((current) => {
      const options = directorIdeas.filter((candidate) => candidate.id !== current.id);
      return options[Math.floor(Math.random() * options.length)] ?? directorIdeas[0];
    });
    setDrawer("director");
  }

  function acceptDirectorIdea() {
    setDirectorTwist(directorProposal);
    setChaos((value) => Math.max(value, directorProposal.chaos));
    setLastChange(directorProposal.line);
    setDrawer(null);
    setToast("DIRECTOR NOTE ADDED. THE WORLD MAY DISOBEY.");
  }

  function declineDirectorIdea() {
    setDrawer(null);
    setToast("THE DIRECTOR WILL KEEP WATCHING.");
  }

  async function share() {
    try { await navigator.clipboard.writeText(`${window.location.origin}${appPath("/g/first-run")}`); setToast("PORTAL COPIED."); }
    catch { setToast("PORTAL READY."); }
    setDrawer(null);
  }

  function goHome() { setPhase("world"); setDrawer(null); window.history.pushState({}, "", appPath("/")); }

  const appStyle = {
    "--castle-keyart": `url("${castleKeyArtUrl}")`,
  } as CSSProperties & Record<"--castle-keyart", string>;

  const drawerView = drawer ? <Drawer
    type={drawer}
    onClose={() => setDrawer(null)}
    onBlueprint={chooseBlueprint}
    onChaos={makeChaotic}
    onChangeIntent={applyChange}
    onShare={share}
    directorProposal={directorProposal}
    directorTwist={directorTwist}
    onDirectorAccept={acceptDirectorIdea}
    onDirectorDecline={declineDirectorIdea}
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

  return <main className={`gc-app gc-${phase} chaos-${chaos}`} style={appStyle}>
    {phase === "world" && <section className="world-screen">
      <div className="key-art" aria-hidden="true" />
      <DirectorEye active={drawer === "director"} onActivate={toggleDirector} />
      <div className="art-wash" aria-hidden="true" />
      <div className="world-weather" aria-hidden="true"><span className="cloud cloud-a" /><span className="cloud cloud-b" /><span className="cloud cloud-c" /></div>
      <div className="world-machinery" aria-hidden="true"><span className="ambient-gear gear-one">✳</span><span className="ambient-gear gear-two">✳</span></div>
      <header className="world-head">
        <button className="gc-logo" type="button" onClick={() => { setDrawer(null); setRemixSource(null); }}><span>▥</span> GameCastle</button>
        <div className="world-links"><button type="button" onClick={() => setDrawer("remix")}><span>▶</span> PLAY GAMES</button><button type="button" onClick={toggleDirector}><span>✦</span> AI DIRECTOR</button></div>
      </header>

      <div className="hero-copy">
        <p className="eyebrow"><i /> A PLACE FOR UNREASONABLE GAMES</p>
        <h1>MAKE A GAME.<br /><span>MAKE IT WEIRD.</span></h1>
        <p className="hero-note">One thought. The castle does the rest.</p>
      </div>

      <button className="hotspot hotspot-workshop" type="button" onClick={() => setToast("THE WORKSHOP MAKES THE RULES.")}><i /> WORKSHOP</button>
      <button className="hotspot hotspot-eye" type="button" onClick={toggleDirector}><i /> WAKE THE DIRECTOR</button>
      <button className="hotspot hotspot-arcade" type="button" onClick={() => setDrawer("remix")}><i /> STEAL A BLUEPRINT</button>

      <form className="idea-console" onSubmit={submit}>
        <div className="console-top"><span>{remixSource ? `REMIXING ${remixSource}` : directorTwist ? `DIRECTOR CUT · ${directorTwist.type}` : "WHAT ARE WE MAKING?"}</span><button type="button" onClick={() => setIdea("")} aria-label="Clear idea">×</button></div>
        <textarea value={idea} onChange={(event) => setIdea(event.target.value)} rows={3} placeholder="A pigeon runs a haunted hotel..." />
        <div className="console-bottom"><div className="chip-strip">{chips.map((chip) => <button type="button" onClick={() => addChip(chip)} key={chip}>{chip}</button>)}</div><button className="surprise" type="button" onClick={() => setIdea("A tired wizard runs a late-night drive-thru for ghosts.")}>?</button></div>
        <button className="build-button" type="submit">MAKE IT <b>→</b></button>
        <button className="pull-control" type="button" onPointerDown={pullStart} onPointerMove={pullMove} onPointerUp={pullEnd} onPointerCancel={pullEnd} onClick={startBuild} aria-label="Pull to make it"><span>PULL</span><i><em style={{ transform: `translateY(${Math.min(lever, 67)}px)` }} /></i></button>
      </form>
      <p className="pull-copy">PULL DOWN OR TAP MAKE IT</p>

      <div className="world-bottom"><button type="button" onClick={() => setDrawer("remix")}><span>01</span> REMIX A GAME</button><button type="button" onClick={toggleDirector}><span>02</span> LET THE CASTLE INTERFERE</button></div>
      {toast && <button className="world-toast" onClick={() => setToast("")}>{toast}</button>}
      {drawerView}
    </section>}

    {phase === "building" && <section className="build-screen" aria-live="polite">
      <div className="build-art" aria-hidden="true" />
      <div className="build-portal" aria-hidden="true" />
      <div className="build-machinery" aria-hidden="true"><span className="build-gear build-gear-a">✳</span><span className="build-gear build-gear-b">✳</span><span className="machine-word word-a">KCHUNK</span><span className="machine-word word-b">CLANK</span></div>
      <div className="build-copy"><p>THE CASTLE IS ON IT.</p><h2>{buildSteps[buildStep][1]}</h2><div className="build-path">{buildSteps.map(([label], index) => <span key={label} className={index <= buildStep ? "done" : ""}><i>{index + 1}</i>{label}</span>)}</div></div>
      <p className={`build-idea ${directorTwist ? "has-director-note" : ""}`}>“{idea}”{directorTwist && <span><b>DIRECTOR CUT</b>{directorTwist.line}</span>}</p>
    </section>}

    {phase === "play" && <section className="play-screen">
      <header className="play-head"><button type="button" onClick={goHome}>✦ GameCastle</button><strong>{title}</strong><span>LIVE</span></header>
      <div className="game-world" onPointerDown={jump} role="button" tabIndex={0} aria-label="Tap to jump">
        <div className="game-horizon"><i /><i /><i /><i /><i /></div><div className="game-sun">☾</div><div className="game-stars">✦　　✦　　　✦</div>
        <div className="game-stats"><b>RUN {score}m</b><span>{lastChange ? "WORLD CHANGED" : directorTwist ? "DIRECTOR CUT" : chaos ? `THE CASTLE IS BORED ×${chaos}` : "NIGHT SHIFT"}</span></div>
        <div className={`runner ${jumping ? "jump" : ""}`}><i>⌃⌃</i><b>•ᴗ•</b><em /></div><div className="chaser">🚓</div><div className="thing-in-way">{chaos > 1 ? "🪑" : "🛒"}</div>{chaos > 0 && <div className="extra-problem">🪑</div>}
        <div className="road"><i /><i /><i /><i /></div><p>TAP TO JUMP</p>
      </div>
      <nav className="play-dock"><button type="button" onClick={() => setDrawer("mutate")}>MUTATE</button><button type="button" onClick={toggleDirector}>DIRECTOR</button><button type="button" onClick={() => setDrawer("friends")}>PORTAL</button><button type="button" onClick={() => setDrawer("share")}>SHARE</button></nav>
      {drawerView}
      {toast && <button className="world-toast play-toast" onClick={() => setToast("")}>{toast}</button>}
    </section>}
  </main>;
}

function Drawer({
  type,
  onClose,
  onBlueprint,
  onChaos,
  onChangeIntent,
  onShare,
  directorProposal,
  directorTwist,
  onDirectorAccept,
  onDirectorDecline,
}: {
  type: Drawer;
  onClose: () => void;
  onBlueprint: (blueprint: (typeof blueprints)[number]) => void;
  onChaos: (level: number, message: string) => void;
  onChangeIntent: (request: string) => void;
  onShare: () => void;
  directorProposal: DirectorIdea;
  directorTwist: DirectorIdea | null;
  onDirectorAccept: () => void;
  onDirectorDecline: () => void;
}) {
  const [request, setRequest] = useState("");
  return <aside className={`game-drawer drawer-${type}`}>
    <button className="drawer-x" type="button" onClick={onClose}>×</button>
    {type === "remix" && <><p className="drawer-kicker">ARCADE FLOOR</p><h2>Take something.<br />Make it worse.</h2><div className="blueprint-row">{blueprints.map((item) => <button className={`blueprint ${item.tone}`} type="button" key={item.title} onClick={() => onBlueprint(item)}><span>{item.emoji}</span><strong>{item.title}</strong><small>{item.line}</small><em>REMIX THIS →</em></button>)}</div></>}
    {type === "director" && <><p className="drawer-kicker">THE DIRECTOR HAS A NOTE</p><h2>Let me add<br />one thing.</h2><div className="director-dialog"><article className="director-proposal"><strong>{directorProposal.type}</strong><blockquote>“{directorProposal.line}”</blockquote><p>This enters as a separate, removable rule. Your original idea stays intact.</p></article><div className="director-actions"><button className="director-accept" type="button" onClick={onDirectorAccept}>ADD TO THIS GAME</button><button className="director-decline" type="button" onClick={onDirectorDecline}>NOT THIS TIME</button></div>{directorTwist && <p className="director-current">CURRENT DIRECTOR CUT · {directorTwist.type}: {directorTwist.line}</p>}</div></>}
    {type === "mutate" && <><p className="drawer-kicker">CHANGE THE RULES</p><h2>What should<br />change next?</h2><form className="change-form" onSubmit={(event) => { event.preventDefault(); onChangeIntent(request); }}><textarea value={request} onChange={(event) => setRequest(event.target.value)} rows={3} placeholder="The boss should throw office chairs." /><button type="submit">CHANGE IT <b>→</b></button></form><p className="suggestion-label">OR START HERE</p><div className="change-suggestions"><button type="button" onClick={() => setRequest("The boss should throw office chairs.")}>BOSS THROWS CHAIRS</button><button type="button" onClick={() => setRequest("Make the whole game much faster.")}>TOO FAST</button><button type="button" onClick={() => setRequest("Add more enemies near the end.")}>MORE ENEMIES</button></div></>}
    {type === "friends" && <><p className="drawer-kicker">OPEN A PORTAL</p><h2>Who&apos;s causing<br />the trouble?</h2><div className="big-actions"><button type="button" onClick={() => onChaos(1, "TEAM PORTAL READY.")}>JOIN MY TEAM <small>Help me escape.</small></button><button type="button" onClick={() => onChaos(2, "BOSS PORTAL READY.")}>CONTROL THE MONSTERS <small>Be awful.</small></button></div></>}
    {type === "share" && <><p className="drawer-kicker">SEND THE PROBLEM</p><h2>Give somebody<br />a weird little game.</h2><button className="share-tape" type="button" onClick={onShare}><span>PLAY IT</span><strong>ESCAPE<br />THE STORE</strong><em>REMIX IT →</em></button></>}
  </aside>;
}
