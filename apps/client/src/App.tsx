import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import {
  EMOTES,
  avatarAccent,
  avatarOption,
  type AvatarConfig,
  type EmoteId,
  type InputPayload,
  type PlayerProfile,
} from '@enico/protocol';
import { createIdentityProvider } from './adapters';
import { AvatarPreview } from './AvatarPreview';
import { EntryGate } from './EntryGate';
import { WorldScene } from './WorldScene';
import { useRealtimeWorld } from './useRealtimeWorld';

const EMOTE_LABELS: Record<EmoteId, string> = {
  wave: 'HI',
  heart: 'LOVE',
  shock: '!!',
  spark: 'SPARK',
};

const EMOTE_ICONS: Record<EmoteId, string> = {
  wave: '◫',
  heart: '♥',
  shock: '!',
  spark: '✦',
};

function formatClock(timestamp: number): string {
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(timestamp);
}

function avatarStyleSummary(avatar: AvatarConfig): string {
  const hair = avatarOption('hairStyle', avatar.hairStyle).label;
  const outfit = avatarOption('outfit', avatar.outfit).label;
  return `${hair} / ${outfit}`;
}

export function App() {
  const [identity] = useState(() =>
    createIdentityProvider(import.meta.env.VITE_IDENTITY_ADAPTER ?? 'local'),
  );
  const [savedProfile, setSavedProfile] = useState<PlayerProfile | null>(() => identity.loadProfile());
  const [activeProfile, setActiveProfile] = useState<PlayerProfile | null>(null);
  const [sessionId] = useState(() => identity.getSessionId());
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState('');
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatLogRef = useRef<HTMLDivElement>(null);

  const worldState = useRealtimeWorld(activeProfile, sessionId);
  const selectedPlayer = worldState.world.players.find((player) => player.id === selectedPlayerId) ?? null;
  const currentPlayer = worldState.world.players.find((player) => player.id === worldState.playerId) ?? null;
  const orderedPlayers = useMemo(
    () =>
      [...worldState.world.players].sort((a, b) => {
        if (a.id === worldState.playerId) return -1;
        if (b.id === worldState.playerId) return 1;
        return a.joinedAt - b.joinedAt;
      }),
    [worldState.playerId, worldState.world.players],
  );

  useEffect(() => {
    if (!activeProfile) return;
    const pressed = new Set<string>();
    let sequence = 0;
    const relevant = new Set([
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
    ]);

    const clearMovement = () => pressed.clear();
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;
      if (event.key === 'Enter' && !editing) {
        event.preventDefault();
        clearMovement();
        chatInputRef.current?.focus();
        return;
      }
      if (editing || !relevant.has(event.code)) return;
      event.preventDefault();
      pressed.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (relevant.has(event.code)) pressed.delete(event.code);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearMovement);
    window.addEventListener('focusin', clearMovement);

    const timer = window.setInterval(() => {
      sequence += 1;
      const input: InputPayload = {
        sequence,
        up: pressed.has('KeyW') || pressed.has('ArrowUp'),
        down: pressed.has('KeyS') || pressed.has('ArrowDown'),
        left: pressed.has('KeyA') || pressed.has('ArrowLeft'),
        right: pressed.has('KeyD') || pressed.has('ArrowRight'),
      };
      worldState.sendInput(input);
    }, 50);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearMovement);
      window.removeEventListener('focusin', clearMovement);
    };
  }, [activeProfile, worldState.sendInput]);

  useEffect(() => {
    if (chatLogRef.current) chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
  }, [worldState.messages]);

  const enterWorld = (profile: PlayerProfile) => {
    identity.saveProfile(profile);
    setSavedProfile(profile);
    setActiveProfile(profile);
  };

  const sendChat = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = chatDraft.trim();
    if (!value) return;
    worldState.sendChat(value);
    setChatDraft('');
  };

  if (!activeProfile) {
    return <EntryGate initialProfile={savedProfile} onEnter={enterWorld} />;
  }

  const activeAvatar = currentPlayer?.avatar ?? activeProfile.avatar;
  const activeAccent = avatarAccent(activeAvatar);
  const latestNotice = worldState.notices.at(-1);

  return (
    <main className="game-shell">
      <header className="game-header">
        <div className="brand-lockup">
          <span className="brand-mark">EV</span>
          <div>
            <strong>PIXEL SQUARE</strong>
            <small>ENICO VECK / SOCIAL TEST UNIT</small>
          </div>
        </div>
        <div className="header-center">
          <span>VECK PLAZA</span>
          <b>NODE 01</b>
          <i>/</i>
          <span>LOCALHOST</span>
        </div>
        <div className={`connection-badge status-${worldState.status}`} data-testid="connection-status">
          <span />
          {worldState.status.toUpperCase()}
        </div>
      </header>

      <section className="game-stage">
        <WorldScene
          players={worldState.world.players}
          currentPlayerId={worldState.playerId}
          selectedPlayerId={selectedPlayerId}
          bubbles={worldState.bubbles}
          emotes={worldState.emotes}
          onSelectPlayer={(id) => setSelectedPlayerId(id || null)}
        />

        <aside className="players-panel panel-glass">
          <div className="panel-heading">
            <div>
              <small>LIVE DIRECTORY</small>
              <strong>PEOPLE HERE</strong>
            </div>
            <b data-testid="player-count">{String(orderedPlayers.length).padStart(2, '0')}</b>
          </div>
          <div className="player-list" data-testid="player-list">
            {orderedPlayers.map((player, index) => (
              <button
                className={player.id === selectedPlayerId ? 'player-row is-active' : 'player-row'}
                data-testid={`player-${player.nickname}`}
                key={player.id}
                type="button"
                onClick={() => setSelectedPlayerId(player.id)}
              >
                <span className="player-number">{String(index + 1).padStart(2, '0')}</span>
                <span
                  className="player-signal"
                  style={{ background: avatarAccent(player.avatar) }}
                  title={avatarOption('outfitColor', player.avatar.outfitColor).label}
                />
                <span className="player-copy">
                  <strong>{player.nickname}{player.id === worldState.playerId ? ' / YOU' : ''}</strong>
                  <small>{player.bio || 'NO STATUS'}</small>
                </span>
                <span className="row-arrow">↗</span>
              </button>
            ))}
            {orderedPlayers.length === 0 ? (
              <div className="panel-empty">SYNCING<br />WORLD STATE...</div>
            ) : null}
          </div>
          <div className="panel-metrics">
            <span>RTT <b>{worldState.latencyMs}ms</b></span>
            <span>TICK <b>{worldState.world.tick}</b></span>
          </div>
        </aside>

        <section className="chat-panel panel-glass">
          <div className="chat-title">
            <span><i /> PROXIMITY CHAT</span>
            <small>RADIUS 6.5M / ENTER</small>
          </div>
          <div className="chat-log" ref={chatLogRef} data-testid="chat-log" aria-live="polite">
            {worldState.messages.length === 0 ? (
              <p className="chat-empty">가까이 다가가 인사를 건네보세요.<br />메시지는 서버에 저장되지 않습니다.</p>
            ) : null}
            {worldState.messages.map((message) => (
              <div className={message.senderId === worldState.playerId ? 'chat-line is-mine' : 'chat-line'} key={message.id}>
                <div><b>{message.senderName}</b><time>{formatClock(message.sentAt)}</time></div>
                <p>{message.text}</p>
              </div>
            ))}
          </div>
          <form className="chat-form" onSubmit={sendChat}>
            <span>&gt;</span>
            <input
              ref={chatInputRef}
              data-testid="chat-input"
              maxLength={140}
              autoComplete="off"
              placeholder="메시지를 입력하고 Enter"
              value={chatDraft}
              onChange={(event) => setChatDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.currentTarget.blur();
                  setChatDraft('');
                }
              }}
            />
            <button type="submit" data-testid="send-chat">SEND</button>
          </form>
        </section>

        <div className="emote-dock" aria-label="이모트">
          <span className="dock-label">SIGNALS</span>
          {EMOTES.map((emote, index) => (
            <button
              key={emote}
              type="button"
              title={EMOTE_LABELS[emote]}
              data-testid={`emote-${emote}`}
              onClick={() => worldState.sendEmote(emote)}
            >
              <small>0{index + 1}</small>
              <b>{EMOTE_ICONS[emote]}</b>
            </button>
          ))}
        </div>

        <div className="control-hint">
          <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> MOVE</span>
          <i />
          <span><kbd>↵</kbd> CHAT</span>
        </div>

        {latestNotice ? (
          <div className="notice-ticker" key={latestNotice.id}>
            <span>SYSTEM</span>{latestNotice.text}
          </div>
        ) : null}

        {worldState.error ? (
          <button className="error-toast" type="button" onClick={worldState.clearError}>
            <b>{worldState.error.code}</b>{worldState.error.message}<span>×</span>
          </button>
        ) : null}

        {selectedPlayer ? (
          <aside
            className="profile-card"
            data-testid="profile-card"
            data-avatar-hair={selectedPlayer.avatar.hairStyle}
            data-avatar-outfit={selectedPlayer.avatar.outfit}
            data-avatar-aura={selectedPlayer.avatar.aura}
          >
            <button className="profile-close" type="button" onClick={() => setSelectedPlayerId(null)}>×</button>
            <div className="profile-card-index">LOCAL PROFILE / {selectedPlayer.id.slice(0, 5).toUpperCase()}</div>
            <div
              className="profile-avatar-stage"
              style={{ '--avatar-accent': avatarAccent(selectedPlayer.avatar) } as CSSProperties}
            >
              <AvatarPreview
                avatar={selectedPlayer.avatar}
                size={128}
                testId="profile-avatar-preview"
                label={`${selectedPlayer.nickname} avatar`}
              />
            </div>
            <small>{selectedPlayer.id === worldState.playerId ? 'THIS IS YOU' : 'HUMAN SIGNAL DETECTED'}</small>
            <h2>{selectedPlayer.nickname}</h2>
            <p>{selectedPlayer.bio || '상태 메시지가 없습니다.'}</p>
            <dl>
              <div><dt>JOINED</dt><dd>{formatClock(selectedPlayer.joinedAt)}</dd></div>
              <div><dt>STYLE</dt><dd>{avatarStyleSummary(selectedPlayer.avatar)}</dd></div>
              <div><dt>RANGE</dt><dd>LOCAL NODE</dd></div>
            </dl>
          </aside>
        ) : null}
      </section>

      <footer className="game-footer">
        <div className="self-chip">
          <span className="self-color" style={{ background: activeAccent }} />
          <b>{currentPlayer?.nickname ?? activeProfile.nickname}</b>
          <small>{currentPlayer ? `${currentPlayer.x.toFixed(1)} / ${currentPlayer.z.toFixed(1)}` : 'SYNCING'}</small>
        </div>
        <p>NO CLOUD · NO TRACKING · EPHEMERAL WORLD</p>
        <button type="button" onClick={() => setActiveProfile(null)}>LEAVE NODE ↗</button>
      </footer>
    </main>
  );
}
