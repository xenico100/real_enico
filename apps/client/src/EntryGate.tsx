import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import {
  AVATAR_CATEGORIES,
  AVATAR_COMBINATION_COUNT,
  AVATAR_OPTIONS,
  DEFAULT_AVATAR,
  avatarOption,
  type AvatarCategory,
  type AvatarConfig,
  type PlayerProfile,
} from '@enico/protocol';
import { validateProfile } from '@enico/game-domain';
import { AvatarPreview } from './AvatarPreview';

interface EntryGateProps {
  initialProfile: PlayerProfile | null;
  onEnter: (profile: PlayerProfile) => void;
}

const CATEGORY_META: Record<AvatarCategory, { label: string; title: string; icon: string }> = {
  skinTone: { label: 'SKIN', title: 'SKIN TONE', icon: '♡' },
  hairStyle: { label: 'HAIR', title: 'HAIR STYLE', icon: '✂' },
  hairColor: { label: 'DYE', title: 'HAIR COLOR', icon: '●' },
  eyes: { label: 'EYES', title: 'EYE MOOD', icon: '✦' },
  outfit: { label: 'LOOK', title: 'OUTFIT', icon: '♱' },
  outfitColor: { label: 'COLOR', title: 'OUTFIT COLOR', icon: '◈' },
  legwear: { label: 'LEGS', title: 'LEGWEAR', icon: '▥' },
  headAccessory: { label: 'HEAD', title: 'HEAD ACCESSORY', icon: '୨୧' },
  faceAccessory: { label: 'FACE', title: 'FACE ACCESSORY', icon: '+' },
  aura: { label: 'AURA', title: 'AURA EFFECT', icon: '☾' },
};

function randomAvatar(): AvatarConfig {
  const next = { ...DEFAULT_AVATAR };
  for (const category of AVATAR_CATEGORIES) {
    const options = AVATAR_OPTIONS[category] as readonly { id: string }[];
    const option = options[Math.floor(Math.random() * options.length)] ?? options[0]!;
    (next as Record<AvatarCategory, string>)[category] = option.id;
  }
  return next;
}

export function EntryGate({ initialProfile, onEnter }: EntryGateProps) {
  const fallback = useMemo<PlayerProfile>(
    () => ({
      nickname: '',
      palette: 'crimson',
      avatar: { ...DEFAULT_AVATAR },
      bio: '오늘도 망가진 채로 귀엽게 살아남기 ♡',
    }),
    [],
  );
  const [draft, setDraft] = useState<PlayerProfile>(initialProfile ?? fallback);
  const [activeCategory, setActiveCategory] = useState<AvatarCategory>('hairStyle');
  const [error, setError] = useState<string | null>(null);
  const activeMeta = CATEGORY_META[activeCategory];
  const activeOptions = AVATAR_OPTIONS[activeCategory] as readonly {
    id: string;
    label: string;
    color?: string;
  }[];
  const selectedOption = avatarOption(activeCategory, draft.avatar[activeCategory]);

  const updateAvatar = (category: AvatarCategory, value: string) => {
    setDraft((current) => ({
      ...current,
      avatar: { ...current.avatar, [category]: value } as AvatarConfig,
    }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validated = validateProfile(draft);
    if (!validated.ok) {
      setError(validated.reason);
      return;
    }
    setError(null);
    onEnter(validated.value);
  };

  return (
    <main className="entry-shell avatar-studio-shell">
      <div className="entry-noise" />
      <header className="entry-topline studio-topline">
        <span>ENICO VECK® / YAMI CHARACTER LAB</span>
        <span>LOCAL DOLL PROTOCOL / 002</span>
      </header>

      <section className="studio-wrap">
        <form className="avatar-studio" onSubmit={submit} data-testid="entry-form">
          <aside className="studio-sidebar">
            <div className="studio-brand">
              <span className="studio-kicker"><i /> PRIVATE NODE IS READY</span>
              <h1>MAKE ME<br /><em>CUTE</em></h1>
              <p>상처도 취향이 되는 야미카와이 픽셀 광장.<br />10 PARTS / ONE LOCAL DOLL.</p>
            </div>
            <nav className="category-tabs" aria-label="아바타 커스텀 카테고리">
              {AVATAR_CATEGORIES.map((category, index) => (
                <button
                  key={category}
                  type="button"
                  className={category === activeCategory ? 'category-tab is-active' : 'category-tab'}
                  data-testid={`avatar-category-${category}`}
                  aria-pressed={category === activeCategory}
                  onClick={() => setActiveCategory(category)}
                >
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <b>{CATEGORY_META[category].label}</b>
                  <small>{avatarOption(category, draft.avatar[category]).label}</small>
                </button>
              ))}
            </nav>
          </aside>

          <section className="studio-options">
            <div className="options-heading">
              <div>
                <span>ACTIVE PART / {activeMeta.icon}</span>
                <h2>{activeMeta.title}</h2>
              </div>
              <b>{String(activeOptions.length).padStart(2, '0')} OPTIONS</b>
            </div>
            <div className="lace-rule" aria-hidden="true"><i /><i /><i /><i /><i /></div>

            <div className="avatar-option-grid" role="group" aria-label={activeMeta.title}>
              {activeOptions.map((option, index) => {
                const active = draft.avatar[activeCategory] === option.id;
                const swatchStyle = option.color
                  ? ({ '--option-color': option.color } as CSSProperties)
                  : undefined;
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={active ? 'avatar-option-card is-selected' : 'avatar-option-card'}
                    data-testid={`avatar-${activeCategory}-${option.id}`}
                    aria-pressed={active}
                    onClick={() => updateAvatar(activeCategory, option.id)}
                  >
                    <span className={option.color ? 'option-swatch has-color' : 'option-swatch'} style={swatchStyle}>
                      {option.color ? '' : CATEGORY_META[activeCategory].icon}
                    </span>
                    <span className="option-copy">
                      <small>TYPE {String(index + 1).padStart(2, '0')}</small>
                      <strong>{option.label}</strong>
                    </span>
                    <span className="option-check" aria-hidden="true">{active ? '♥' : '♡'}</span>
                  </button>
                );
              })}
            </div>

            <div className="current-selection">
              <span>SELECTED</span>
              <strong>{selectedOption.label}</strong>
              <small>{activeMeta.icon} LOCKED</small>
            </div>
          </section>

          <section className="studio-preview-panel">
            <div className="preview-heading">
              <div><span>REALTIME DOLL</span><strong>LIVE PREVIEW</strong></div>
              <i>♡</i>
            </div>
            <div className="avatar-preview-stage">
              <span className="preview-stitch preview-stitch--top" />
              <AvatarPreview avatar={draft.avatar} size={238} testId="avatar-preview" label="현재 커스텀 아바타 미리보기" />
              <span className="preview-stitch preview-stitch--bottom" />
              <b className="preview-badge">LOCAL / 01</b>
            </div>

            <div className="avatar-summary">
              <span><small>HAIR</small>{avatarOption('hairStyle', draft.avatar.hairStyle).label}</span>
              <span><small>EYES</small>{avatarOption('eyes', draft.avatar.eyes).label}</span>
              <span><small>LOOK</small>{avatarOption('outfit', draft.avatar.outfit).label}</span>
            </div>

            <div className="identity-fields">
              <label htmlFor="nickname">DISPLAY NAME</label>
              <input
                id="nickname"
                data-testid="nickname-input"
                autoFocus
                autoComplete="off"
                maxLength={16}
                placeholder="닉네임을 입력하세요"
                value={draft.nickname}
                onChange={(event) => setDraft((current) => ({ ...current, nickname: event.target.value }))}
              />
              <label htmlFor="bio">ONE-LINE MOOD</label>
              <input
                id="bio"
                data-testid="bio-input"
                autoComplete="off"
                maxLength={48}
                placeholder="오늘의 상태 메시지"
                value={draft.bio}
                onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))}
              />
            </div>

            <div className="studio-actions-secondary">
              <button type="button" data-testid="avatar-randomize" onClick={() => setDraft((current) => ({ ...current, avatar: randomAvatar() }))}>⤨ RANDOM MIX</button>
              <button type="button" data-testid="avatar-reset" onClick={() => setDraft((current) => ({ ...current, avatar: { ...DEFAULT_AVATAR } }))}>↺ RESET DOLL</button>
            </div>

            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="enter-button studio-enter-button" type="submit" data-testid="enter-button">
              <span>ENTER AS THIS DOLL</span><b>↗</b>
            </button>
            <p className="combination-count">
              <b>{AVATAR_COMBINATION_COUNT.toLocaleString('ko-KR')}</b> UNIQUE COMBINATIONS · LOCAL STORAGE ONLY
            </p>
          </section>
        </form>
      </section>

      <footer className="entry-footer studio-footer">
        <span>WASD / ARROWS TO MOVE</span><span>BE CUTE / STAY STRANGE</span><span>© ENICO VECK LAB</span>
      </footer>
    </main>
  );
}
