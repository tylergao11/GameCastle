"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { DIRECTOR_EYE_IRIS, DIRECTOR_EYE_PATCH } from "./directorEyeAssets";
import "../director-eye.css";

type Gaze = { x: number; y: number };

type DirectorEyeProps = {
  active: boolean;
  onActivate: () => void;
};

const IDLE_GAZES: Gaze[] = [
  { x: 0, y: 0 },
  { x: -7, y: -2 },
  { x: 7, y: 2 },
  { x: 3, y: -6 },
  { x: -4, y: 5 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
];

export default function DirectorEye({ active, onActivate }: DirectorEyeProps) {
  const [gaze, setGaze] = useState<Gaze>({ x: 0, y: 0 });
  const moveTimer = useRef<number | null>(null);
  const returnTimer = useRef<number | null>(null);

  useEffect(() => {
    const clearTimers = () => {
      if (moveTimer.current !== null) window.clearTimeout(moveTimer.current);
      if (returnTimer.current !== null) window.clearTimeout(returnTimer.current);
      moveTimer.current = null;
      returnTimer.current = null;
    };

    clearTimers();

    if (active) {
      setGaze({ x: 0, y: 7 });
      return clearTimers;
    }

    let cancelled = false;

    const scheduleMove = (delay = 5200 + Math.random() * 3600) => {
      moveTimer.current = window.setTimeout(() => {
        if (cancelled) return;

        const next = IDLE_GAZES[Math.floor(Math.random() * IDLE_GAZES.length)];
        setGaze(next);

        returnTimer.current = window.setTimeout(() => {
          if (!cancelled) setGaze({ x: 0, y: 0 });
        }, 2100 + Math.random() * 1100);

        scheduleMove(7600 + Math.random() * 5600);
      }, delay);
    };

    scheduleMove();

    return () => {
      cancelled = true;
      clearTimers();
    };
  }, [active]);

  const style = {
    "--director-gaze-x": `${gaze.x}%`,
    "--director-gaze-y": `${gaze.y}%`,
  } as CSSProperties & Record<"--director-gaze-x" | "--director-gaze-y", string>;

  return (
    <div className="director-eye-stage" aria-live="polite">
      <div className={`director-eye ${active ? "is-awake" : "is-idle"}`} style={style}>
        <img className="director-eye-patch" src={DIRECTOR_EYE_PATCH} alt="" aria-hidden="true" />
        <div className="director-eye-iris-motion" aria-hidden="true">
          <img className="director-eye-iris" src={DIRECTOR_EYE_IRIS} alt="" />
        </div>
        <span className="director-eye-glow" aria-hidden="true" />
        <span className="director-eye-hint" aria-hidden="true" />
        <button
          className="director-eye-button"
          type="button"
          aria-label={active ? "让导演安静下来" : "唤醒 GameCastle 导演"}
          aria-pressed={active}
          onClick={onActivate}
        />
      </div>
    </div>
  );
}
