export const AVATAR_OPTIONS = {
  skinTone: [
    { id: 'porcelain', label: 'PORCELAIN', color: '#ffe1dc' },
    { id: 'peach', label: 'PEACH', color: '#efb9a6' },
    { id: 'honey', label: 'HONEY', color: '#ca8d72' },
    { id: 'deep', label: 'DEEP', color: '#865744' },
  ],
  hairStyle: [
    { id: 'hime', label: 'HIME CUT' },
    { id: 'twintail', label: 'TWIN TAIL' },
    { id: 'wolf', label: 'WOLF CUT' },
    { id: 'bob', label: 'DOLL BOB' },
    { id: 'long', label: 'GHOST LONG' },
    { id: 'bun', label: 'DOUBLE BUN' },
  ],
  hairColor: [
    { id: 'ink', label: 'INK BLACK', color: '#17131c' },
    { id: 'wine', label: 'DARK WINE', color: '#641d3a' },
    { id: 'pink', label: 'DUSTY PINK', color: '#d886a6' },
    { id: 'lavender', label: 'LAVENDER', color: '#9a82c2' },
    { id: 'silver', label: 'MOON SILVER', color: '#d7d3df' },
    { id: 'blue', label: 'MIDNIGHT', color: '#344b78' },
    { id: 'split', label: 'SPLIT DYE', color: '#e99bbd' },
  ],
  eyes: [
    { id: 'doll', label: 'DOLL EYES' },
    { id: 'droop', label: 'SLEEPY' },
    { id: 'sparkle', label: 'SPARKLE' },
    { id: 'cross', label: 'CROSS' },
    { id: 'teary', label: 'TEARY' },
  ],
  outfit: [
    { id: 'lace', label: 'LACE DRESS' },
    { id: 'sailor', label: 'DARK SAILOR' },
    { id: 'hoodie', label: 'OVERSIZE HOODIE' },
    { id: 'nurse', label: 'YAMI NURSE' },
    { id: 'idol', label: 'BROKEN IDOL' },
    { id: 'goth', label: 'GOTH LOLITA' },
  ],
  outfitColor: [
    { id: 'blackpink', label: 'BLACK / PINK', color: '#b73567' },
    { id: 'lavender', label: 'LAVENDER', color: '#7c5a9f' },
    { id: 'crimson', label: 'CRIMSON', color: '#b8001f' },
    { id: 'babyblue', label: 'BABY BLUE', color: '#5f91b4' },
    { id: 'milk', label: 'MILK WHITE', color: '#e9e5e4' },
    { id: 'acid', label: 'ACID', color: '#a8c53a' },
  ],
  legwear: [
    { id: 'kneesocks', label: 'KNEE SOCKS' },
    { id: 'striped', label: 'STRIPED' },
    { id: 'fishnet', label: 'FISHNET' },
    { id: 'garter', label: 'GARTER' },
    { id: 'bare', label: 'BARE' },
  ],
  headAccessory: [
    { id: 'none', label: 'NONE' },
    { id: 'bigbow', label: 'BIG BOW' },
    { id: 'catears', label: 'CAT EARS' },
    { id: 'halo', label: 'BROKEN HALO' },
    { id: 'horns', label: 'TINY HORNS' },
    { id: 'headphones', label: 'HEARTPHONES' },
    { id: 'bonnet', label: 'LACE BONNET' },
  ],
  faceAccessory: [
    { id: 'none', label: 'NONE' },
    { id: 'bandage', label: 'HEART BANDAGE' },
    { id: 'eyepatch', label: 'HEART PATCH' },
    { id: 'mask', label: 'DARK MASK' },
    { id: 'tears', label: 'GLITTER TEARS' },
    { id: 'piercing', label: 'PIERCING' },
  ],
  aura: [
    { id: 'none', label: 'NONE' },
    { id: 'hearts', label: 'HEART RAIN' },
    { id: 'sparkles', label: 'STAR DUST' },
    { id: 'glitch', label: 'PINK GLITCH' },
    { id: 'bats', label: 'TINY BATS' },
    { id: 'thorns', label: 'THORN RING' },
  ],
} as const;

export type AvatarConfig = {
  [K in keyof typeof AVATAR_OPTIONS]: (typeof AVATAR_OPTIONS)[K][number]['id'];
};
export type AvatarCategory = keyof AvatarConfig;
export type AvatarOption<K extends AvatarCategory = AvatarCategory> =
  (typeof AVATAR_OPTIONS)[K][number];

export const AVATAR_CATEGORIES = Object.freeze(
  Object.keys(AVATAR_OPTIONS),
) as readonly AvatarCategory[];

export const DEFAULT_AVATAR: AvatarConfig = {
  skinTone: 'porcelain',
  hairStyle: 'twintail',
  hairColor: 'ink',
  eyes: 'teary',
  outfit: 'lace',
  outfitColor: 'blackpink',
  legwear: 'kneesocks',
  headAccessory: 'bigbow',
  faceAccessory: 'bandage',
  aura: 'hearts',
};

export const AVATAR_COMBINATION_COUNT = AVATAR_CATEGORIES.reduce(
  (total, category) => total * AVATAR_OPTIONS[category].length,
  1,
);

export function isAvatarConfig(value: unknown): value is AvatarConfig {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return AVATAR_CATEGORIES.every((category) => {
    const options = AVATAR_OPTIONS[category] as readonly { id: string }[];
    return options.some((option) => option.id === record[category]);
  });
}

export function avatarOption<K extends AvatarCategory>(
  category: K,
  id: AvatarConfig[K],
): AvatarOption<K> {
  const options = AVATAR_OPTIONS[category] as readonly { id: string }[];
  const option = options.find((candidate) => candidate.id === id);
  if (!option) throw new Error(`Unknown avatar option: ${category}/${id}`);
  return option as AvatarOption<K>;
}

export function avatarAccent(avatar: AvatarConfig): string {
  return avatarOption('outfitColor', avatar.outfitColor).color;
}

export function avatarConfigKey(avatar: AvatarConfig): string {
  return AVATAR_CATEGORIES.map((category) => avatar[category]).join('|');
}

export function createAvatarVariant(seed: number): AvatarConfig {
  const normalizedSeed = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) : 0;
  const avatar = { ...DEFAULT_AVATAR };
  AVATAR_CATEGORIES.forEach((category, offset) => {
    const options = AVATAR_OPTIONS[category] as readonly { id: string }[];
    const option = options[(normalizedSeed + offset * 3) % options.length] ?? options[0]!;
    (avatar as Record<AvatarCategory, string>)[category] = option.id;
  });
  return avatar;
}
