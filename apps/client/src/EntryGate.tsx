import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { AVATAR_PALETTES, type PaletteId, type PlayerProfile } from '@enico/protocol';
import { validateProfile } from '@enico/game-domain';

interface EntryGateProps {
  initialProfile: PlayerProfile | null;
  onEnter: (profile: PlayerProfile) => void;
}

export function EntryGate({ initialProfile, onEnter }: EntryGateProps) {
  const fallback = useMemo<PlayerProfile>(
    () => ({
      nickname: '',
      palette: 'crimson',
      bio: 'LOCAL SOUL / NO CLOUD',
    }),
    [],
  );
  const [draft, setDraft] = useState<PlayerProfile>(initialProfile ?? fallback);
  const [error, setError] = useState<string | null>(null);
  const selected = AVATAR_PALETTES.find((palette) => palette.id === draft.palette) ?? AVATAR_PALETTES[0];

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
    <main className="entry-shell">
      <div className="entry-noise" />
      <header className="entry-topline">
        <span>ENICO VECK® DIGITAL CULTURE UNIT</span>
        <span>LOCAL PROTOCOL / 001</span>
      </header>

      <section className="entry-hero">
        <div className="entry-copy">
          <p className="eyebrow"><span className="live-dot" /> PRIVATE NODE IS READY</p>
          <h1>
            PIXEL<br />
            <span>SQUARE</span>
          </h1>
          <p className="entry-deck">
            오래된 온라인 광장의 온도와 새로운 로컬 네트워크.<br />
            누구의 데이터도 가져가지 않는 작은 소셜 월드.
          </p>
          <div className="entry-coordinate">
            <span>37°33′N</span>
            <i />
            <span>VECK PLAZA / NODE 01</span>
          </div>
        </div>

        <form className="entry-card" onSubmit={submit} data-testid="entry-form">
          <div className="card-index">ENTRY PASS <b>№ 0001</b></div>
          <div className="pass-preview">
            <div
              className="pixel-person pixel-person--large"
              style={{
                '--skin': selected.skin,
                '--hair': selected.hair,
                '--top': selected.top,
                '--bottoms': selected.bottoms,
                '--accent': selected.accent,
              } as CSSProperties}
            >
              <span className="pixel-hair" />
              <span className="pixel-face" />
              <span className="pixel-body" />
              <span className="pixel-legs" />
            </div>
            <div className="pass-copy">
              <small>AVATAR SIGNAL</small>
              <strong>{selected.label}</strong>
              <span>STATUS / UNVERIFIED HUMAN</span>
            </div>
          </div>

          <label className="field-label" htmlFor="nickname">DISPLAY NAME</label>
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

          <label className="field-label" htmlFor="bio">ONE-LINE STATUS</label>
          <input
            id="bio"
            data-testid="bio-input"
            autoComplete="off"
            maxLength={48}
            placeholder="오늘의 상태 메시지"
            value={draft.bio}
            onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))}
          />

          <fieldset className="palette-fieldset">
            <legend>SELECT SIGNAL</legend>
            <div className="palette-grid">
              {AVATAR_PALETTES.map((palette, index) => (
                <button
                  className={palette.id === draft.palette ? 'palette-chip is-active' : 'palette-chip'}
                  data-testid={`palette-${palette.id}`}
                  key={palette.id}
                  type="button"
                  onClick={() => setDraft((current) => ({ ...current, palette: palette.id as PaletteId }))}
                  aria-label={palette.label}
                  aria-pressed={palette.id === draft.palette}
                >
                  <span style={{ background: palette.top }} />
                  <b>0{index + 1}</b>
                </button>
              ))}
            </div>
          </fieldset>

          {error ? <p className="form-error" role="alert">{error}</p> : null}

          <button className="enter-button" type="submit" data-testid="enter-button">
            <span>ENTER NODE</span>
            <b>↗</b>
          </button>
          <p className="privacy-note">NO ACCOUNT · NO CLOUD · LOCAL STORAGE ONLY</p>
        </form>
      </section>

      <footer className="entry-footer">
        <span>WASD / ARROW KEYS TO MOVE</span>
        <span>ENTER TO CHAT</span>
        <span>© ENICO VECK LAB</span>
      </footer>
    </main>
  );
}
