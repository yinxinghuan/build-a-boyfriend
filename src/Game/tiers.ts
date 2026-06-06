// The 渣男 evolution ladder — index 0 (smallest) → 10 (final boss).
// radius is in logical world units (jar interior is ~340 wide).
// color is the fallback-disc base; img is loaded at runtime from public/tiers/.

export interface Tier {
  idx: number;
  radius: number;
  color: string;   // fallback disc base color
  ring: string;    // fallback ring / glow accent
  nameZh: string;
  nameEn: string;
  /** one-liner shouted when you FORM this tier (the joke) */
  quipZh: string;
  quipEn: string;
}

export const TIERS: Tier[] = [
  { idx: 0,  radius: 17, color: '#8a8597', ring: '#b9b3c6', nameZh: '点赞之交',   nameEn: 'The Liker',        quipZh: '只给你点赞', quipEn: 'just likes your posts' },
  { idx: 1,  radius: 23, color: '#7d6f9e', ring: '#a594c9', nameZh: '半夜「在吗」', nameEn: 'The 3AM "u up?"',  quipZh: '凌晨准时上线', quipEn: 'online at 3AM sharp' },
  { idx: 2,  radius: 30, color: '#6f6bb0', ring: '#9a97e0', nameZh: '健身房推销男', nameEn: 'The Gym Bro',       quipZh: '先加我私教课', quipEn: 'buy my coaching plan' },
  { idx: 3,  radius: 37, color: '#bf6fa6', ring: '#e79ccd', nameZh: '备胎',        nameEn: 'The Benchwarmer',  quipZh: '永远第二顺位', quipEn: 'always second string' },
  { idx: 4,  radius: 45, color: '#d96f8e', ring: '#f5a8bf', nameZh: '暧昧对象',     nameEn: 'The Situationship', quipZh: '我们算什么？', quipEn: 'what even are we?' },
  { idx: 5,  radius: 53, color: '#e07a6f', ring: '#f7ad9f', nameZh: '网恋男友',     nameEn: 'The Online BF',    quipZh: '从没见过面',   quipEn: 'never met IRL' },
  { idx: 6,  radius: 62, color: '#d98a4f', ring: '#f5bd86', nameZh: '正牌男友',     nameEn: 'The Boyfriend',    quipZh: '终于公开了',   quipEn: 'finally official' },
  { idx: 7,  radius: 71, color: '#c9a23f', ring: '#ecca78', nameZh: '同居室友',     nameEn: 'The Roommate',     quipZh: '他东西堆满了',  quipEn: 'his stuff is everywhere' },
  { idx: 8,  radius: 81, color: '#9fb04a', ring: '#cfe184', nameZh: '未婚夫',       nameEn: 'The Fiancé',       quipZh: '戒指刷你卡的', quipEn: 'ring on your card' },
  { idx: 9,  radius: 92, color: '#6fb56f', ring: '#a4e0a4', nameZh: '老公',         nameEn: 'The Husband',      quipZh: '袜子永远在地上', quipEn: 'socks on the floor forever' },
  { idx: 10, radius: 103, color: '#f5b1c7', ring: '#ffffff', nameZh: '巨婴老公',    nameEn: 'The Man-Baby',     quipZh: '你养成了！',   quipEn: 'you raised him!' },
];

export const FINAL_TIER = TIERS.length - 1;

// only these tiers can drop from the top (Suika spawns small ones)
export const SPAWNABLE = [0, 1, 2, 3, 4];

// triangular-number scoring for FORMING a given tier (1..10)
export const MERGE_POINTS = [0, 1, 3, 6, 10, 15, 21, 28, 36, 45, 66];

export function nextSpawnTier(): number {
  // weight toward smaller
  const r = Math.random();
  if (r < 0.4) return 0;
  if (r < 0.7) return 1;
  if (r < 0.88) return 2;
  if (r < 0.97) return 3;
  return 4;
}
