type Locale = 'zh' | 'en';

function detectLocale(): Locale {
  const o = localStorage.getItem('game_locale');
  if (o === 'en' || o === 'zh') return o;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

const STR = {
  title:     { zh: '养成渣男',        en: 'Build-a-Boyfriend' },
  tagline:   { zh: '同款相撞，合并进化', en: 'merge two of a kind to level him up' },
  hint:      { zh: '拖动放置 · 松手掉落', en: 'drag to aim · release to drop' },
  score:     { zh: '战绩',            en: 'SCORE' },
  best:      { zh: '最高',            en: 'BEST' },
  next:      { zh: '下一个',          en: 'NEXT' },
  gameover:  { zh: '塞满了',          en: 'ALL FULL' },
  goSub:     { zh: '渣男堆到顶了',     en: 'the pile hit the ceiling' },
  retry:     { zh: '再养一个',        en: 'RAISE ANOTHER' },
  win:       { zh: '巨婴养成！',       en: 'MAN-BABY RAISED!' },
} as const;

const locale = detectLocale();

export function t(key: keyof typeof STR): string {
  return STR[key][locale];
}

export function tierName(zh: string, en: string): string {
  return locale === 'zh' ? zh : en;
}

export const LOCALE = locale;
