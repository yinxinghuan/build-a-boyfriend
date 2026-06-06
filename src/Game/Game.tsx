import { useEffect, useRef, useState, useCallback } from 'react';
import { BoyfriendGame, WORLD_W, WORLD_H } from './engine';
import { TIERS } from './tiers';
import { unlock } from './audio';
import { t, tierName } from './i18n';
import './Game.less';

interface Popup { id: number; x: number; y: number; tier: number; name: string; quip: string; pts: number; kind: 'merge' | 'final'; }

const BEST_KEY = 'build_a_boyfriend_best';
const BASE = (import.meta as any).env?.BASE_URL ?? '/';
const tierImg = (idx: number) => `${BASE}tiers/tier${idx}.png`;
const pad = (n: number) => String(Math.max(0, n)).padStart(5, '0');

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<BoyfriendGame | null>(null);
  const draggingRef = useRef(false);
  const popupId = useRef(0);

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => parseInt(localStorage.getItem(BEST_KEY) ?? '0', 10));
  const [nextTier, setNextTier] = useState(0);
  const [maxTier, setMaxTier] = useState(0);
  const [started, setStarted] = useState(false);
  const [over, setOver] = useState(false);
  const [popups, setPopups] = useState<Popup[]>([]);

  const spawnPopup = useCallback((pts: number, x: number, y: number, tier: number, kind: 'merge' | 'final') => {
    const td = TIERS[tier];
    const id = popupId.current++;
    const p: Popup = { id, x, y, tier, pts, kind, name: tierName(td.nameZh, td.nameEn), quip: tierName(td.quipZh, td.quipEn) };
    setPopups(prev => [...prev, p]);
    setTimeout(() => setPopups(prev => prev.filter(q => q.id !== id)), 1100);
  }, []);

  const makeGame = useCallback((canvas: HTMLCanvasElement) => new BoyfriendGame(canvas, {
    onScore: setScore,
    onPopup: spawnPopup,
    onGameOver: () => setOver(true),
    onTurn: (_cur, next) => setNextTier(next),
    onMaxTier: setMaxTier,
  }), [spawnPopup]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const game = makeGame(canvas);
    gameRef.current = game;
    setNextTier(game.getNextTier());
    const onResize = () => game.resize();
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); game.destroy(); };
  }, [makeGame]);

  // persist best
  useEffect(() => {
    setBest(b => {
      if (score > b) { localStorage.setItem(BEST_KEY, String(score)); return score; }
      return b;
    });
  }, [score]);

  const toWorldX = (clientX: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return (clientX - rect.left) / rect.width * WORLD_W;
  };

  const onDown = (e: React.PointerEvent) => {
    if (over) return;
    const g = gameRef.current!;
    if (!started) { unlock(); g.start(); setStarted(true); }
    draggingRef.current = true;
    g.setAim(toWorldX(e.clientX));
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    gameRef.current!.setAim(toWorldX(e.clientX));
  };
  const onUp = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    gameRef.current!.setAim(toWorldX(e.clientX));
    gameRef.current!.drop();
  };

  const restart = () => {
    gameRef.current?.destroy();
    const game = makeGame(canvasRef.current!);
    gameRef.current = game;
    setScore(0); setOver(false); setStarted(true); setMaxTier(0);
    setNextTier(game.getNextTier());
    unlock(); game.start();
  };

  const nt = TIERS[nextTier];

  return (
    <div className="bab">
      <div className="bab__hud">
        <div className="bab__panel bab__panel--score">
          <span className="bab__plabel">SCORE</span>
          <span className="bab__num">{pad(score)}</span>
        </div>
        <div className="bab__panel bab__panel--hi">
          <span className="bab__plabel">HI</span>
          <span className="bab__num">{pad(best)}</span>
        </div>
        <div className="bab__panel bab__panel--next">
          <span className="bab__plabel">NEXT</span>
          <span className="bab__nextimg"><img src={tierImg(nextTier)} alt="" draggable={false} /></span>
          <span className="bab__nextname">{tierName(nt.nameZh, nt.nameEn)}</span>
        </div>
      </div>

      <div className="bab__stage">
        <canvas
          ref={canvasRef}
          className="bab__canvas"
          style={{ aspectRatio: `${WORLD_W} / ${WORLD_H}` }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />

        {popups.map(p => (
          <div
            key={p.id}
            className={`bab__popup ${p.kind === 'final' ? 'bab__popup--final' : ''}`}
            style={{ left: `${(p.x / WORLD_W) * 100}%`, top: `${(p.y / WORLD_H) * 100}%` }}
          >
            <span className="bab__pop-name" style={{ color: TIERS[p.tier].ring }}>{p.name}</span>
            <span className="bab__pop-quip">{p.quip}</span>
            <span className="bab__pop-pts">+{p.pts}</span>
          </div>
        ))}

        {!started && (
          <div className="bab__hint">
            <div className="bab__hint-title">{t('title')}</div>
            <div className="bab__hint-sub">{t('tagline')}</div>
            <div className="bab__hint-cta">{t('hint')}</div>
          </div>
        )}

        {over && (
          <div className="bab__over" onPointerDown={(e) => e.stopPropagation()}>
            <div className="bab__over-card">
              <div className="bab__over-title">{maxTier >= TIERS.length - 1 ? t('win') : t('gameover')}</div>
              <div className="bab__over-sub">{t('goSub')}</div>
              <div className="bab__over-score">{pad(score)}</div>
              <div className="bab__over-best">{t('best')} {pad(best)}</div>
              <button className="bab__retry" onClick={restart}>{t('retry')}</button>
            </div>
          </div>
        )}
      </div>

      <div className="bab__chain">
        {TIERS.map(td => {
          const on = td.idx <= maxTier;
          const target = td.idx === maxTier + 1;
          return (
            <div key={td.idx} className={`bab__chip${on ? ' is-on' : ''}${target ? ' is-target' : ''}`}>
              <img src={tierImg(td.idx)} alt="" draggable={false} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
