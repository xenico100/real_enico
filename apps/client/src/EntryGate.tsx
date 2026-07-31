import { useMemo, useState, type FormEvent } from 'react';
import {
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

const CATEGORY_META: Record<AvatarCategory, { label: string; icon: string }> = {
  skinTone: { label: 'SKIN', icon: '♡' },
  hairStyle: { label: 'HAIR', icon: '✂' },
  hairColor: { label: 'DYE', icon: '●' },
  eyes: { label: 'EYES', icon: '✦' },
  outfit: { label: 'LOOK', icon: '♱' },
  outfitColor: { label: 'COLOR', icon: '◈' },
  legwear: { label: 'LEGS', icon: '▥' },
  headAccessory: { label: 'HEAD', icon: '୨୧' },
  faceAccessory: { label: 'FACE', icon: '+' },
  aura: { label: 'AURA', icon: '☾' },
};
const CATEGORIES = Object.keys(CATEGORY_META) as AvatarCategory[];

function randomAvatar(): AvatarConfig {
  const next = { ...DEFAULT_AVATAR } as AvatarConfig;
  for (const category of CATEGORIES) {
    const options = AVATAR_OPTIONS[category];
    const option = options[Math.floor(Math.random() * options.length)]!;
    (next as unknown as Record<string, string>)[category] = option.id;
  }
  return next;
}

export function EntryGate({ initialProfile, onEnter }: EntryGateProps) {
  const fallback = useMemo<PlayerProfile>(() => ({
    nickname: '',
    palette: 'crimson',
    avatar: { ...DEFAULT_AVATAR },
    bio: '오늘도 망가진 채로 귀엽게 살아남기 ♡',
  }), []);
  const [draft, setDraft] = useState<PlayerProfile>(initialProfile ?? fallback);
  const [activeCategory, setActiveCategory] = useState<AvatarCategory>('hairStyle');
  const [error, setError] = useState<string | null>(null);
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
    <main className="entry-shell avatar-entry-shell">
      <div className="entry-noise" />
      <header className="entry-topline">
        <span>ENICO VECK® / YAMI CHARACTER LAB</span>
        <span>LOCAL DOLL PROTOCOL / 002</span>
      </header>

      <section className="entry-hero avatar-entry-hero">
        <div className="entry-copy avatar-entry-copy">
          <p className="eyebrow"><span className="live-dot" /> PRIVATE NODE IS READY</p>
          <h1>MAKE<br /><span>ME CUTE</span></h1>
          <p className="entry-deck">
            상처도 취향이 되는 야미카와이 픽셀 광장.<br />
            {AVATAR_COMBINATION_COUNT.toLocaleString('ko-KR')}개의 조합으로 하나뿐인 인형을 만들어.
          </p>
          <div className="entry-coordinate"><span>♡ 24H ONLINE</span><i /><span>VECK DOLL LAB / 01</span></div>
        </div>

        <form className="entry-card avatar-studio" onSubmit={submit} data-testid="entry-form">
          <div className="card-index"><span>AVATAR CUSTOM STUDIO ♱</span><b>{AVATAR_COMBINATION_COUNT.toLocaleString()} COMBOS</b></div>

          <div className="avatar-studio-body">
            <section className="avatar-preview-pane">
              <div className={`avatar-preview-stage aura-preview-${draft.avatar.aura}`}>
                <span className="preview-charm charm-one">♡</span>
                <span className="preview-charm charm-two">✦</span>
                <AvatarPreview avatar={draft.avatar} size={250} testId="avatar-preview" />
                <div className="preview-floor" />
              </div>
              <strong>{draft.nickname.trim() || 'UNTITLED DOLL'}</strong>
              <small>{avatarOption('hairStyle', draft.avatar.hairStyle).label} / {avatarOption('outfit', draft.avatar.outfit).label}</small>
              <div className="avatar-quick-actions">
                <button type="button" data-testid="avatar-randomize" onClick={() => setDraft((current) => ({ ...current, avatar: randomAvatar() }))}>⤨ RANDOM</button>
                <button type="button" data-testid="avatar-reset" onClick={() => setDraft((current) => ({ ...current, avatar: { ...DEFAULT_AVATAR } }))}>↺ RESET</button>
              </div>
            </section>

            <section className="avatar-editor-pane">
              <div className="identity-fields">
                <label><span>DISPLAY NAME</span><input data-testid="nickname-input" autoFocus autoComplete="off" maxLength={16} placeholder="닉네임" value={draft.nickname} onChange={(event) => setDraft((current) => ({ ...current, nickname: event.target.value }))} /></label>
                <label><span>ONE-LINE MOOD</span><input data-testid="bio-input" autoComplete="off" maxLength={48} placeholder="오늘의 상태" value={draft.bio} onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))} /></label>
              </div>

              <nav className="avatar-category-tabs" aria-label="아바타 커스텀 카테고리">
                {CATEGORIES.map((category) => (
                  <button key={category} type="button" className={category === activeCategory ? 'is-active' : ''} data-testid={`avatar-category-${category}`} aria-pressed={category === activeCategory} onClick={() => setActiveCategory(category)}>
                    <b>{CATEGORY_META[category].icon}</b><span>{CATEGORY_META[category].label}</span>
                  </button>
                ))}
              </nav>

              <div className="avatar-option-heading"><span>{CATEGORY_META[activeCategory].label} SELECT</span><b>{selectedOption.label}</b></div>
              <div className="avatar-options" role="group" aria-label={CATEGORY_META[activeCategory].label}>
                {AVATAR_OPTIONS[activeCategory].map((option) => {
                  const active = draft.avatar[activeCategory] === option.id;
                  return (
                    <button key={option.id} type="button" className={active ? 'avatar-option is-active' : 'avatar-option'} data-testid={`avatar-${activeCategory}-${option.id}`} aria-pressed={active} onClick={() => updateAvatar(activeCategory, option.id)}>
                      {'color' in option ? <i style={{ background: option.color }} /> : <i className="option-symbol">{active ? '♥' : '♡'}</i>}
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="studio-submit-row">
            <p>NO ACCOUNT · NO CLOUD · YOUR DOLL STAYS LOCAL</p>
            <button className="enter-button" type="submit" data-testid="enter-button"><span>ENTER AS THIS DOLL</span><b>↗</b></button>
          </div>
        </form>
      </section>

      <footer className="entry-footer"><span>WASD / ARROWS TO MOVE</span><span>BE CUTE / STAY STRANGE</span><span>© ENICO VECK LAB</span></footer>
    </main>
  );
}
