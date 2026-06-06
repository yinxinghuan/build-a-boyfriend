import Matter from 'matter-js';
import { TIERS, FINAL_TIER, MERGE_POINTS, nextSpawnTier } from './tiers';
import { playDrop, playMerge, playFinal, playGameOver } from './audio';

export const WORLD_W = 360;
export const WORLD_H = 600;
const WALL = 14;
const DROP_Y = 52;       // where the held piece hovers
const KILL_Y = 104;      // jar mouth; resting above this = game over
const OVER_GRACE = 1100; // ms a body must overflow before game over
const DROP_COOLDOWN = 420;

interface BodyPlugin { isBf: true; tier: number; merged: boolean; bornAt: number; }
type BFBody = Matter.Body & { plugin: BodyPlugin };

function isBfBody(b: Matter.Body): b is BFBody {
  return !!(b.plugin && (b.plugin as Partial<BodyPlugin>).isBf);
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; }

// Per-tier face spec for the hand-drawn fallback (used until tier art loads).
// Each archetype gets distinct hair, brow mood, mouth and a prop glyph so the
// ladder reads as 11 escalating boyfriends even with no PNGs.
type Hair = 'flat' | 'hood' | 'band' | 'cap' | 'neat' | 'messy' | 'side' | 'thin' | 'bonnet';
type Mouth = 'meek' | 'smirk' | 'grin' | 'frown' | 'wavy' | 'kiss' | 'smile' | 'lazy' | 'smug' | 'snore' | 'bawl';
type Prop = 'heart' | 'zzz' | 'dumbbell' | 'flower' | 'q' | 'screen' | 'none' | 'sock' | 'ring' | 'remote' | 'paci';
interface Face { skin: string; hair: string; hairStyle: Hair; brow: number; mouth: Mouth; prop: Prop; }

const FACES: Face[] = [
  { skin: '#e8d9d0', hair: '#5a5560', hairStyle: 'flat',   brow:  0.1, mouth: 'meek',  prop: 'heart'    }, // 点赞之交
  { skin: '#d8cad8', hair: '#3a3346', hairStyle: 'hood',   brow: -0.1, mouth: 'smirk', prop: 'zzz'      }, // 3AM u up
  { skin: '#e6c9b0', hair: '#6b4a2f', hairStyle: 'band',   brow:  0.8, mouth: 'grin',  prop: 'dumbbell' }, // gym bro
  { skin: '#e9d6cf', hair: '#4a4038', hairStyle: 'neat',   brow: -0.9, mouth: 'frown', prop: 'flower'   }, // benchwarmer
  { skin: '#ecccc8', hair: '#5a3f4a', hairStyle: 'messy',  brow:  0.3, mouth: 'wavy',  prop: 'q'        }, // situationship
  { skin: '#e7c4bd', hair: '#5a4a6a', hairStyle: 'side',   brow:  0.2, mouth: 'kiss',  prop: 'screen'   }, // online bf
  { skin: '#eccdb6', hair: '#3a2c22', hairStyle: 'neat',   brow:  0.4, mouth: 'smile', prop: 'none'     }, // boyfriend
  { skin: '#ddc2a8', hair: '#2e2620', hairStyle: 'messy',  brow: -0.2, mouth: 'lazy',  prop: 'sock'     }, // roommate
  { skin: '#e6c6aa', hair: '#352a22', hairStyle: 'side',   brow:  0.7, mouth: 'smug',  prop: 'ring'     }, // fiance
  { skin: '#e3c0a2', hair: '#4a4038', hairStyle: 'thin',   brow:  0.0, mouth: 'snore', prop: 'remote'   }, // husband
  { skin: '#f3c9cf', hair: '#caa9b0', hairStyle: 'bonnet', brow: -0.6, mouth: 'bawl',  prop: 'paci'     }, // man-baby
];

export interface GameCallbacks {
  onScore: (total: number) => void;
  onPopup: (text: string, x: number, y: number, tier: number) => void;
  onGameOver: () => void;
  onTurn: (current: number, next: number) => void;
}

export class BoyfriendGame {
  private engine: Matter.Engine;
  private world: Matter.World;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private images: (HTMLImageElement | null)[] = [];
  private particles: Particle[] = [];
  private mergeQueue: { a: BFBody; b: BFBody }[] = [];

  private aimX = WORLD_W / 2;
  private currentTier = nextSpawnTier();
  private nextTier = nextSpawnTier();
  private canDrop = true;
  private lastDrop = 0;
  private overSince = 0;
  private gameOver = false;
  private started = false;
  private score = 0;
  private lastTs = 0;

  constructor(canvas: HTMLCanvasElement, private cb: GameCallbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.engine = Matter.Engine.create();
    this.engine.gravity.y = 1.0;
    this.world = this.engine.world;
    this.buildWalls();
    this.loadImages();
    this.setupCollisions();
    this.resize();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  getNextTier() { return this.nextTier; }
  getCurrentTier() { return this.currentTier; }

  private buildWalls() {
    const opt = { isStatic: true, friction: 0.5, restitution: 0.0 };
    // Thick bodies (extending outward) so fast small circles can't tunnel through.
    const T = 200;
    const floor = Matter.Bodies.rectangle(WORLD_W / 2, (WORLD_H - WALL) + T / 2, WORLD_W + T * 2, T, opt);
    const left = Matter.Bodies.rectangle(WALL - T / 2, WORLD_H / 2, T, WORLD_H * 2, opt);
    const right = Matter.Bodies.rectangle((WORLD_W - WALL) + T / 2, WORLD_H / 2, T, WORLD_H * 2, opt);
    Matter.Composite.add(this.world, [floor, left, right]);
  }

  private loadImages() {
    const base = (import.meta as any).env?.BASE_URL ?? '/';
    TIERS.forEach((tier) => {
      const img = new Image();
      img.src = `${base}tiers/tier${tier.idx}.png`;
      img.onload = () => { this.images[tier.idx] = img; };
      img.onerror = () => { this.images[tier.idx] = null; };
      this.images[tier.idx] = null;
    });
  }

  private setupCollisions() {
    Matter.Events.on(this.engine, 'collisionStart', (e) => {
      for (const pair of e.pairs) {
        const a = pair.bodyA;
        const b = pair.bodyB;
        if (!isBfBody(a) || !isBfBody(b)) continue;
        if (a.plugin.merged || b.plugin.merged) continue;
        if (a.plugin.tier !== b.plugin.tier) continue;
        a.plugin.merged = true;
        b.plugin.merged = true;
        this.mergeQueue.push({ a, b });
      }
    });
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.lastDrop = performance.now();
  }

  setAim(worldX: number) {
    const tier = TIERS[this.currentTier];
    const min = WALL + tier.radius;
    const max = WORLD_W - WALL - tier.radius;
    this.aimX = Math.max(min, Math.min(max, worldX));
  }

  drop() {
    if (!this.started || this.gameOver || !this.canDrop) return;
    const tier = TIERS[this.currentTier];
    const body = Matter.Bodies.circle(this.aimX, DROP_Y, tier.radius, {
      restitution: 0.05,
      friction: 0.55,
      frictionStatic: 0.7,
      density: 0.0014,
      slop: 0.02,
    }) as BFBody;
    body.plugin = { isBf: true, tier: this.currentTier, merged: false, bornAt: performance.now() };
    Matter.Composite.add(this.world, body);
    playDrop();
    this.currentTier = this.nextTier;
    this.nextTier = nextSpawnTier();
    this.canDrop = false;
    this.lastDrop = performance.now();
    this.cb.onTurn(this.currentTier, this.nextTier);
  }

  private processMerges() {
    if (!this.mergeQueue.length) return;
    const q = this.mergeQueue;
    this.mergeQueue = [];
    for (const { a, b } of q) {
      const tier = a.plugin.tier;
      const mx = (a.position.x + b.position.x) / 2;
      const my = (a.position.y + b.position.y) / 2;
      Matter.Composite.remove(this.world, a);
      Matter.Composite.remove(this.world, b);
      this.burst(mx, my, TIERS[tier].ring, tier);

      if (tier >= FINAL_TIER) {
        // two man-babies cancel out — big clear
        this.addScore(MERGE_POINTS[FINAL_TIER] * 2, mx, my, FINAL_TIER, true);
        playFinal();
        continue;
      }
      const newTier = tier + 1;
      const nb = Matter.Bodies.circle(mx, my, TIERS[newTier].radius, {
        restitution: 0.08,
        friction: 0.55,
        frictionStatic: 0.7,
        density: 0.0014,
        slop: 0.02,
      }) as BFBody;
      nb.plugin = { isBf: true, tier: newTier, merged: false, bornAt: performance.now() };
      Matter.Composite.add(this.world, nb);
      Matter.Body.setVelocity(nb, { x: 0, y: -2.2 });
      this.addScore(MERGE_POINTS[newTier], mx, my, newTier, newTier === FINAL_TIER);
      if (newTier === FINAL_TIER) playFinal(); else playMerge(newTier);
    }
  }

  private addScore(pts: number, x: number, y: number, tier: number, big = false) {
    this.score += pts;
    this.cb.onScore(this.score);
    const tierDef = TIERS[tier];
    this.cb.onPopup(big ? tierDef.nameZh : `+${pts}`, x, y, tier);
  }

  private burst(x: number, y: number, color: string, tier: number) {
    const n = 6 + tier;
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1 + Math.random() * 3;
      this.particles.push({
        x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 1,
        life: 0, max: 26 + Math.random() * 14, color,
      });
    }
  }

  private bfBodies(): BFBody[] {
    return Matter.Composite.allBodies(this.world).filter(isBfBody);
  }

  private checkGameOver(now: number) {
    if (this.gameOver) return;
    let overflowing = false;
    for (const b of this.bfBodies()) {
      if (now - b.plugin.bornAt < 700) continue; // ignore freshly dropped
      const settled = Math.abs(b.velocity.y) < 0.6 && Math.abs(b.velocity.x) < 0.6;
      if (settled && b.position.y - b.circleRadius! < KILL_Y) { overflowing = true; break; }
    }
    if (overflowing) {
      if (!this.overSince) this.overSince = now;
      else if (now - this.overSince > OVER_GRACE) {
        this.gameOver = true;
        playGameOver();
        this.cb.onGameOver();
      }
    } else {
      this.overSince = 0;
    }
  }

  private loop(ts: number) {
    const dt = this.lastTs ? Math.min(33, ts - this.lastTs) : 16;
    this.lastTs = ts;

    if (this.started && !this.gameOver) {
      Matter.Engine.update(this.engine, dt);
      this.processMerges();
      if (!this.canDrop && ts - this.lastDrop > DROP_COOLDOWN) this.canDrop = true;
      this.checkGameOver(performance.now());
    }
    this.updateParticles();
    this.draw();
    this.raf = requestAnimationFrame(this.loop);
  }

  private updateParticles() {
    this.particles = this.particles.filter(p => p.life < p.max);
    for (const p of this.particles) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.vx *= 0.98; p.life++;
    }
  }

  // ---- rendering ----
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.width = WORLD_W * dpr;
    this.canvas.height = WORLD_H * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private drawGuy(b: { x: number; y: number; r: number; tier: number }) {
    const ctx = this.ctx;
    const tierDef = TIERS[b.tier];
    const img = this.images[b.tier];
    ctx.save();
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.closePath();
    // soft glow
    ctx.shadowColor = tierDef.ring;
    ctx.shadowBlur = 10;
    ctx.fillStyle = tierDef.color;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.clip();
    if (img && img.complete && img.naturalWidth) {
      const d = b.r * 2;
      ctx.drawImage(img, b.x - b.r, b.y - b.r, d, d);
    } else {
      this.drawFallbackFace(b.x, b.y, b.r, b.tier);
    }
    ctx.restore();
    // ring
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r - 1, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = tierDef.ring;
    ctx.globalAlpha = 0.85;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawFallbackFace(x: number, y: number, r: number, tier: number) {
    const ctx = this.ctx;
    const f = FACES[tier] ?? FACES[0];
    const ink = '#2a1822';
    const lw = Math.max(1.2, r * 0.055);

    // skin face inset slightly so the brand-colored disc shows as a rim
    ctx.fillStyle = f.skin;
    ctx.beginPath(); ctx.arc(x, y, r * 0.9, 0, Math.PI * 2); ctx.fill();

    // soft top light
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.45, r * 0.1, x, y, r);
    g.addColorStop(0, '#ffffff30'); g.addColorStop(1, '#00000000');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 0.9, 0, Math.PI * 2); ctx.fill();

    // cheeks blush
    ctx.fillStyle = '#ff7a9a33';
    ctx.beginPath(); ctx.ellipse(x - r * 0.42, y + r * 0.2, r * 0.16, r * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + r * 0.42, y + r * 0.2, r * 0.16, r * 0.1, 0, 0, Math.PI * 2); ctx.fill();

    this.drawHair(x, y, r, f);

    // eyes
    const eo = r * 0.32, ey = y - r * 0.05, es = Math.max(1.3, r * 0.1);
    const sleepy = f.hairStyle === 'hood' || f.mouth === 'snore';
    ctx.fillStyle = ink;
    if (sleepy) {
      ctx.lineWidth = lw; ctx.strokeStyle = ink;
      ctx.beginPath(); ctx.arc(x - eo, ey, es, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + eo, ey, es, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(x - eo, ey, es, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + eo, ey, es, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffffcc';
      ctx.beginPath(); ctx.arc(x - eo + es * 0.4, ey - es * 0.4, es * 0.35, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + eo + es * 0.4, ey - es * 0.4, es * 0.35, 0, Math.PI * 2); ctx.fill();
    }

    // brows — angle conveys mood (+ cocky/up-outer, - worried/up-inner)
    const by = y - r * 0.28, bw = r * 0.18, tilt = f.brow * r * 0.16;
    ctx.lineWidth = Math.max(1.1, r * 0.045); ctx.strokeStyle = ink; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - eo - bw, by - tilt); ctx.lineTo(x - eo + bw, by + tilt); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + eo + bw, by - tilt); ctx.lineTo(x + eo - bw, by + tilt); ctx.stroke();

    this.drawMouth(x, y, r, f.mouth, ink, lw);
    this.drawProp(x, y, r, f.prop);
  }

  private drawHair(x: number, y: number, r: number, f: Face) {
    const ctx = this.ctx;
    ctx.fillStyle = f.hair;
    const top = y - r * 0.9;
    switch (f.hairStyle) {
      case 'hood': {
        ctx.fillStyle = f.hair;
        ctx.beginPath(); ctx.arc(x, y, r * 0.9, Math.PI * 1.08, Math.PI * 1.92); ctx.lineTo(x, y); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x, top + r * 0.34, r * 0.78, r * 0.42, 0, Math.PI, Math.PI * 2); ctx.fill();
        break;
      }
      case 'band': {
        ctx.beginPath(); ctx.ellipse(x, top + r * 0.3, r * 0.74, r * 0.34, 0, Math.PI, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ff5a7a'; ctx.lineWidth = r * 0.14; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x - r * 0.6, y - r * 0.28); ctx.quadraticCurveTo(x, y - r * 0.5, x + r * 0.6, y - r * 0.28); ctx.stroke();
        break;
      }
      case 'cap':
      case 'neat': {
        ctx.beginPath(); ctx.ellipse(x, top + r * 0.32, r * 0.76, r * 0.4, 0, Math.PI, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - r * 0.1, top + r * 0.2); ctx.lineTo(x + r * 0.4, top + r * 0.5); ctx.lineTo(x - r * 0.1, top + r * 0.55); ctx.closePath();
        ctx.fillStyle = f.skin; ctx.fill();
        break;
      }
      case 'side': {
        ctx.beginPath(); ctx.ellipse(x, top + r * 0.34, r * 0.78, r * 0.42, 0, Math.PI, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - r * 0.7, top + r * 0.4); ctx.quadraticCurveTo(x + r * 0.2, top + r * 0.1, x + r * 0.55, top + r * 0.55); ctx.lineTo(x - r * 0.7, top + r * 0.6); ctx.fill();
        break;
      }
      case 'messy': {
        for (let i = -3; i <= 3; i++) {
          ctx.beginPath();
          const sx = x + i * r * 0.22;
          ctx.moveTo(sx - r * 0.13, top + r * 0.5);
          ctx.lineTo(sx, top + (i % 2 ? r * 0.05 : r * 0.18));
          ctx.lineTo(sx + r * 0.13, top + r * 0.5);
          ctx.fill();
        }
        ctx.beginPath(); ctx.ellipse(x, top + r * 0.44, r * 0.74, r * 0.3, 0, Math.PI, Math.PI * 2); ctx.fill();
        break;
      }
      case 'thin': {
        ctx.beginPath(); ctx.ellipse(x - r * 0.42, top + r * 0.42, r * 0.22, r * 0.16, 0, Math.PI, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + r * 0.42, top + r * 0.42, r * 0.22, r * 0.16, 0, Math.PI, Math.PI * 2); ctx.fill();
        break;
      }
      case 'bonnet': {
        ctx.beginPath(); ctx.ellipse(x, top + r * 0.36, r * 0.82, r * 0.5, 0, Math.PI, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; // frill dots
        for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.arc(x + i * r * 0.24, top + r * 0.5, r * 0.07, 0, Math.PI * 2); ctx.fill(); }
        break;
      }
      default: { // flat
        ctx.beginPath(); ctx.ellipse(x, top + r * 0.28, r * 0.7, r * 0.3, 0, Math.PI, Math.PI * 2); ctx.fill();
      }
    }
  }

  private drawMouth(x: number, y: number, r: number, m: Mouth, ink: string, lw: number) {
    const ctx = this.ctx;
    const my = y + r * 0.42, mw = r * 0.34;
    ctx.lineWidth = lw; ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineCap = 'round';
    ctx.beginPath();
    switch (m) {
      case 'grin':
      case 'smile':
        ctx.moveTo(x - mw, my - r * 0.04); ctx.quadraticCurveTo(x, my + r * 0.26, x + mw, my - r * 0.04); ctx.stroke();
        break;
      case 'smug':
      case 'smirk':
        ctx.moveTo(x - mw, my + r * 0.06); ctx.quadraticCurveTo(x + mw * 0.4, my + r * 0.2, x + mw, my - r * 0.12); ctx.stroke();
        break;
      case 'frown':
        ctx.moveTo(x - mw, my + r * 0.12); ctx.quadraticCurveTo(x, my - r * 0.14, x + mw, my + r * 0.12); ctx.stroke();
        break;
      case 'wavy':
        ctx.moveTo(x - mw, my); ctx.quadraticCurveTo(x - mw * 0.3, my - r * 0.14, x, my); ctx.quadraticCurveTo(x + mw * 0.3, my + r * 0.14, x + mw, my); ctx.stroke();
        break;
      case 'kiss':
        ctx.arc(x, my, r * 0.1, 0, Math.PI * 2); ctx.stroke();
        break;
      case 'lazy':
        ctx.moveTo(x - mw, my); ctx.lineTo(x + mw * 0.6, my); ctx.stroke();
        break;
      case 'snore':
        ctx.ellipse(x, my, r * 0.12, r * 0.16, 0, 0, Math.PI * 2); ctx.stroke();
        break;
      case 'bawl':
        ctx.moveTo(x - mw, my + r * 0.02); ctx.quadraticCurveTo(x, my + r * 0.3, x + mw, my + r * 0.02);
        ctx.quadraticCurveTo(x, my + r * 0.14, x - mw, my + r * 0.02); ctx.fill();
        break;
      default: // meek
        ctx.moveTo(x - mw * 0.6, my); ctx.quadraticCurveTo(x, my + r * 0.08, x + mw * 0.6, my); ctx.stroke();
    }
  }

  private drawProp(x: number, y: number, r: number, prop: Prop) {
    const ctx = this.ctx;
    const px = x + r * 0.52, py = y - r * 0.5, s = r * 0.26;
    ctx.save();
    switch (prop) {
      case 'heart':
        ctx.fillStyle = '#ff5a7a';
        ctx.beginPath();
        ctx.moveTo(px, py + s * 0.3);
        ctx.bezierCurveTo(px, py, px - s, py, px - s, py + s * 0.4);
        ctx.bezierCurveTo(px - s, py + s, px, py + s * 1.1, px, py + s * 1.4);
        ctx.bezierCurveTo(px, py + s * 1.1, px + s, py + s, px + s, py + s * 0.4);
        ctx.bezierCurveTo(px + s, py, px, py, px, py + s * 0.3);
        ctx.fill();
        break;
      case 'zzz':
        ctx.fillStyle = '#cdbfe0'; ctx.font = `bold ${Math.round(r * 0.5)}px system-ui`; ctx.textAlign = 'center';
        ctx.fillText('z', px, py + s * 0.6); ctx.fillText('z', px + s * 0.6, py); break;
      case 'dumbbell':
        ctx.fillStyle = '#3a3346'; ctx.strokeStyle = '#3a3346'; ctx.lineWidth = r * 0.1;
        ctx.beginPath(); ctx.moveTo(px - s * 0.7, py + s * 0.6); ctx.lineTo(px + s * 0.7, py + s * 0.6); ctx.stroke();
        ctx.beginPath(); ctx.arc(px - s * 0.7, py + s * 0.6, s * 0.34, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(px + s * 0.7, py + s * 0.6, s * 0.34, 0, Math.PI * 2); ctx.fill(); break;
      case 'flower':
        ctx.fillStyle = '#ffd24a';
        for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; ctx.beginPath(); ctx.ellipse(px + Math.cos(a) * s * 0.4, py + Math.sin(a) * s * 0.4, s * 0.26, s * 0.16, a, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#ff5a7a'; ctx.beginPath(); ctx.arc(px, py, s * 0.22, 0, Math.PI * 2); ctx.fill(); break;
      case 'q':
        ctx.fillStyle = '#ffd24a'; ctx.font = `900 ${Math.round(r * 0.62)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('?', px, py + s * 0.3); break;
      case 'screen':
        ctx.strokeStyle = '#9ad0ff'; ctx.lineWidth = r * 0.07; ctx.fillStyle = '#9ad0ff22';
        ctx.beginPath(); ctx.rect(px - s, py - s * 0.2, s * 1.8, s * 1.3); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#9ad0ff'; ctx.beginPath(); ctx.arc(px - s * 0.1, py + s * 0.45, s * 0.18, 0, Math.PI * 2); ctx.fill(); break;
      case 'sock':
        ctx.fillStyle = '#c8b89a'; ctx.beginPath();
        ctx.moveTo(px - s * 0.4, py); ctx.lineTo(px + s * 0.2, py); ctx.lineTo(px + s * 0.2, py + s * 0.7);
        ctx.lineTo(px + s * 0.7, py + s * 0.7); ctx.lineTo(px + s * 0.7, py + s); ctx.lineTo(px - s * 0.4, py + s); ctx.closePath(); ctx.fill(); break;
      case 'ring':
        ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = r * 0.09;
        ctx.beginPath(); ctx.arc(px, py + s * 0.5, s * 0.45, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#9ad0ff'; ctx.beginPath();
        ctx.moveTo(px, py - s * 0.2); ctx.lineTo(px + s * 0.22, py + s * 0.04); ctx.lineTo(px, py + s * 0.28); ctx.lineTo(px - s * 0.22, py + s * 0.04); ctx.closePath(); ctx.fill(); break;
      case 'remote':
        ctx.fillStyle = '#2e2620'; ctx.beginPath(); ctx.rect(px - s * 0.35, py - s * 0.2, s * 0.7, s * 1.3); ctx.fill();
        ctx.fillStyle = '#ff5a7a'; ctx.beginPath(); ctx.arc(px, py + s * 0.1, s * 0.14, 0, Math.PI * 2); ctx.fill(); break;
      case 'paci':
        ctx.strokeStyle = '#ff5a7a'; ctx.lineWidth = r * 0.08; ctx.fillStyle = '#ffd24a';
        ctx.beginPath(); ctx.arc(px, py + s * 0.5, s * 0.32, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(px, py + s * 0.5, s * 0.16, 0, Math.PI * 2); ctx.fill(); break;
      default: break;
    }
    ctx.restore();
  }

  private draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, WORLD_W, WORLD_H);

    // jar interior bg
    ctx.fillStyle = '#2a1426';
    ctx.fillRect(WALL, 0, WORLD_W - WALL * 2, WORLD_H - WALL);
    // walls
    ctx.fillStyle = '#48203f';
    ctx.fillRect(0, 0, WALL, WORLD_H);
    ctx.fillRect(WORLD_W - WALL, 0, WALL, WORLD_H);
    ctx.fillRect(0, WORLD_H - WALL, WORLD_W, WALL);

    // kill line
    ctx.save();
    ctx.strokeStyle = this.overSince ? '#ff5a7a' : '#ffffff55';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(WALL, KILL_Y);
    ctx.lineTo(WORLD_W - WALL, KILL_Y);
    ctx.stroke();
    ctx.restore();

    // bodies
    for (const b of this.bfBodies()) {
      this.drawGuy({ x: b.position.x, y: b.position.y, r: b.circleRadius!, tier: b.plugin.tier });
      // rotate marker not needed; circles
    }

    // particles
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // held / aim piece
    if (this.started && !this.gameOver && this.canDrop) {
      const tierDef = TIERS[this.currentTier];
      // drop guide
      ctx.save();
      ctx.strokeStyle = '#ffffff22';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.moveTo(this.aimX, DROP_Y + tierDef.radius);
      ctx.lineTo(this.aimX, WORLD_H - WALL);
      ctx.stroke();
      ctx.restore();
      this.drawGuy({ x: this.aimX, y: DROP_Y, r: tierDef.radius, tier: this.currentTier });
    }
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    Matter.Events.off(this.engine, 'collisionStart');
    Matter.World.clear(this.world, false);
    Matter.Engine.clear(this.engine);
  }
}
