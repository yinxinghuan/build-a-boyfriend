import { useEffect, useRef, useState, useCallback } from 'react';
import { BoyfriendGame, WORLD_W, WORLD_H } from './engine';
import { TIERS } from './tiers';
import { unlock } from './audio';
import { t, tierName } from './i18n';
import './Game.less';

interface Popup { id: number; text: string; x: number; y: number; tier: number; }

const BEST_KEY = 'build_a_boyfriend_best';

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<BoyfriendGame | null>(null);
  const draggingRef = useRef(false);
  const popupId = useRef(0);

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => parseInt(localStorage.getItem(BEST_KEY) ?? '0', 10));
  const [nextTier, setNextTier] = useState(0);
  const [started, setStarted] = useState(false);
  const [over, setOver] = useState(false);
  const [popups, setPopups] = useState<Popup[]>([]);

  const spawnPopup = useCallback((text: string, x: number, y: number, tier: number) => {
    const id = popupId.current++;
    setPopups(p => [...p, { id, text, x, y, tier }]);
    setTimeout(() => setPopups(p => p.filter(q => q.id !== id)), 900);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const game = new BoyfriendGame(canvas, {
      onScore: setScore,
      onPopup: spawnPopup,
      onGameOver: () => setOver(true),
      onTurn: (_cur, next) => setNextTier(next),
    });
    gameRef.current = game;
    setNextTier(game.getNextTier());
    const onResize = () => game.resize();
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); game.destroy(); };
  }, [spawnPopup]);

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
    const canvas = canvasRef.current!;
    const game = new BoyfriendGame(canvas, {
      onScore: setScore,
      onPopup: spawnPopup,
      onGameOver: () => setOver(true),
      onTurn: (_cur, next) => setNextTier(next),
    });
    gameRef.current = game;
    setScore(0); setOver(false); setStarted(true);
    setNextTier(game.getNextTier());
    unlock(); game.start();
  };

  const nt = TIERS[nextTier];

  return (
    <div className="bab">
      <div className="bab__top">
        <div className="bab__scores">
          <div className="bab__scoreblock">
            <span className="bab__label">{t('score')}</span>
            <span className="bab__score">{score}</span>
          </div>
          <div className="bab__scoreblock bab__scoreblock--best">
            <span className="bab__label">{t('best')}</span>
            <span className="bab__best">{best}</span>
          </div>
        </div>
        <div className="bab__next">
          <span className="bab__label">{t('next')}</span>
          <span className="bab__nextdot" style={{ background: nt.color, boxShadow: `0 0 8px ${nt.ring}` }} />
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
            className="bab__popup"
            style={{ left: `${(p.x / WORLD_W) * 100}%`, top: `${(p.y / WORLD_H) * 100}%`, color: TIERS[p.tier].ring }}
          >
            {p.text}
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
              <div className="bab__over-title">{t('gameover')}</div>
              <div className="bab__over-sub">{t('goSub')}</div>
              <div className="bab__over-score">{score}</div>
              <div className="bab__over-best">{t('best')} {best}</div>
              <button className="bab__retry" onClick={restart}>{t('retry')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
