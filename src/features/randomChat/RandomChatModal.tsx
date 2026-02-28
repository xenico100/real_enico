'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, Send, Wifi, WifiOff } from 'lucide-react';
import { useRandomChat } from '@/features/randomChat/useRandomChat';

type RandomChatModalProps = {
  open: boolean;
  onClose: () => void;
};

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function formatDateDivider(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function isSameDay(left: string, right: string) {
  const leftDate = new Date(left);
  const rightDate = new Date(right);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) return false;
  return (
    leftDate.getFullYear() === rightDate.getFullYear() &&
    leftDate.getMonth() === rightDate.getMonth() &&
    leftDate.getDate() === rightDate.getDate()
  );
}

function shortenUserId(userId: string) {
  if (!userId) return '';
  return userId.replace(/-/g, '').slice(0, 4);
}

export function RandomChatModal({ open, onClose }: RandomChatModalProps) {
  const {
    roomId,
    messages,
    loading,
    error,
    myDisplayName,
    myUserId,
    memberCount,
    roomStatus,
    typingUsers,
    realtimeConnected,
    sendMessage,
    setTyping,
  } = useRandomChat(open);

  const [input, setInput] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [viewportStyle, setViewportStyle] = useState<CSSProperties | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const typingStopTimerRef = useRef<number | null>(null);

  const statusText = useMemo(() => {
    if (loading) return '매칭중';
    if (roomStatus === 'closed') return '방 종료';
    if (roomId) return '대화중';
    return '대기중';
  }, [loading, roomId, roomStatus]);

  useEffect(() => {
    if (!open) return;
    const target = listRef.current;
    if (!target) return;
    target.scrollTop = target.scrollHeight;
  }, [messages, open, typingUsers]);

  useEffect(() => {
    if (!open) {
      if (typingStopTimerRef.current !== null) {
        window.clearTimeout(typingStopTimerRef.current);
        typingStopTimerRef.current = null;
      }
      void setTyping(false).catch(() => undefined);
      setInput('');
      setSendError(null);
      setSending(false);
    }
  }, [open, setTyping]);

  useEffect(() => {
    if (!open || typeof window === 'undefined') {
      setViewportStyle(null);
      return;
    }

    const vv = window.visualViewport;
    if (!vv) {
      setViewportStyle(null);
      return;
    }

    const updateViewport = () => {
      const topInset = Math.max(0, vv.offsetTop);
      const keyboardInset = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
      setViewportStyle({
        top: `${topInset}px`,
        bottom: `${keyboardInset}px`,
      });
    };

    updateViewport();
    vv.addEventListener('resize', updateViewport);
    vv.addEventListener('scroll', updateViewport);
    window.addEventListener('orientationchange', updateViewport);

    return () => {
      vv.removeEventListener('resize', updateViewport);
      vv.removeEventListener('scroll', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-x-0 z-[220] bg-[#020409] md:bg-black/80 md:backdrop-blur-sm overflow-hidden"
      style={viewportStyle || { top: 0, bottom: 0 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="단체랜덤채팅"
    >
      <div
        className="w-full h-full max-h-full md:max-w-2xl md:mx-auto md:my-4 md:max-h-[88vh] md:rounded-2xl md:border md:border-[#232734] bg-[#050912] text-[#f3f6ff] flex flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="shrink-0 border-b border-[#1a2233] px-3 py-2.5 md:px-5 md:py-4 bg-[#070d1a]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={onClose}
                className="h-9 w-9 shrink-0 rounded-full bg-[#111827] border border-[#283245] grid place-items-center text-[#dbe3f4]"
                aria-label="채팅 닫기"
              >
                <ArrowLeft size={18} />
              </button>

              <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#4f46e5] grid place-items-center text-white font-semibold text-sm">
                {((myDisplayName || '익명').replace('익명_', '') || 'CH').slice(0, 2)}
              </div>

              <div className="min-w-0">
                <p className="text-[15px] md:text-base font-semibold truncate">단체랜덤채팅</p>
                <div className="flex items-center gap-1.5 text-[11px] text-[#9aa7bf]">
                  <span>{statusText}</span>
                  <span>·</span>
                  <span>{memberCount}명</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 text-[11px] text-[#9aa7bf]">
              {realtimeConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
              <span>{realtimeConnected ? '실시간' : '동기화'}</span>
            </div>
          </div>
        </header>

        <main
          ref={listRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 md:px-5 md:py-4 space-y-2 bg-[#030712]"
        >
          {messages.length === 0 ? (
            <div className="h-full grid place-items-center text-center text-sm text-[#73819a]">
              <div>
                <p>{loading ? '채팅방 연결 중...' : '아직 메시지가 없습니다.'}</p>
                <p className="text-xs mt-1">첫 메시지를 보내보세요.</p>
              </div>
            </div>
          ) : (
            messages.map((item, index) => {
              const mine = item.userId === myUserId;
              const previous = messages[index - 1];
              const showDivider = !previous || !isSameDay(previous.createdAt, item.createdAt);
              const senderLabel = mine ? myDisplayName || '나' : `익명_${shortenUserId(item.userId)}`;

              return (
                <div key={item.id} className="space-y-1.5">
                  {showDivider ? (
                    <div className="py-2 text-center text-[11px] text-[#8f9bb0]">
                      {formatDateDivider(item.createdAt)}
                    </div>
                  ) : null}

                  <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[82%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                      {!mine ? <p className="text-[11px] text-[#94a3bb] mb-0.5 px-1">{senderLabel}</p> : null}

                      <div
                        className={
                          mine
                            ? 'rounded-[18px] rounded-br-md bg-gradient-to-r from-[#8b5cf6] to-[#7c3aed] px-3 py-2 text-white shadow-[0_8px_24px_rgba(124,58,237,0.35)]'
                            : 'rounded-[18px] rounded-bl-md bg-[#1d2534] px-3 py-2 text-[#e8eefb] border border-[#2b3548]'
                        }
                      >
                        <p className="text-[15px] leading-snug whitespace-pre-wrap break-words">{item.message}</p>
                      </div>

                      <p className="px-1 mt-0.5 text-[10px] text-[#7f8ca5]">{formatTime(item.createdAt)}</p>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {typingUsers.length > 0 ? (
            <div className="text-xs text-[#9db0d3] px-1 py-1">
              {typingUsers.slice(0, 2).join(', ')}
              {typingUsers.length > 2 ? ` 외 ${typingUsers.length - 2}명` : ''} 입력 중...
            </div>
          ) : null}
        </main>

        <footer className="shrink-0 border-t border-[#1a2233] bg-[#070d1a] px-3 pt-2 pb-[calc(12px+env(safe-area-inset-bottom))] md:px-5 md:pb-3">
          {error ? <p className="mb-2 text-xs text-[#ff9b9b]">{error}</p> : null}
          {sendError ? <p className="mb-2 text-xs text-[#ff9b9b]">{sendError}</p> : null}

          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const text = input.trim();
              if (!text || loading || sending || roomStatus === 'closed') return;

              setSendError(null);
              setSending(true);
              if (typingStopTimerRef.current !== null) {
                window.clearTimeout(typingStopTimerRef.current);
                typingStopTimerRef.current = null;
              }
              void setTyping(false).catch(() => undefined);

              try {
                await sendMessage(text);
                setInput('');
              } catch (nextError) {
                setSendError(nextError instanceof Error ? nextError.message : '메시지 전송 실패');
              } finally {
                setSending(false);
              }
            }}
          >
            <div className="flex items-center gap-2 rounded-full border border-[#2a3447] bg-[#141b28] px-2 py-1.5">
              <input
                value={input}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setInput(nextValue);

                  const hasText = nextValue.trim().length > 0;
                  if (!hasText) {
                    if (typingStopTimerRef.current !== null) {
                      window.clearTimeout(typingStopTimerRef.current);
                      typingStopTimerRef.current = null;
                    }
                    void setTyping(false).catch(() => undefined);
                    return;
                  }

                  void setTyping(true).catch(() => undefined);

                  if (typingStopTimerRef.current !== null) {
                    window.clearTimeout(typingStopTimerRef.current);
                  }
                  typingStopTimerRef.current = window.setTimeout(() => {
                    void setTyping(false).catch(() => undefined);
                    typingStopTimerRef.current = null;
                  }, 1200);
                }}
                onBlur={() => {
                  if (typingStopTimerRef.current !== null) {
                    window.clearTimeout(typingStopTimerRef.current);
                    typingStopTimerRef.current = null;
                  }
                  void setTyping(false).catch(() => undefined);
                }}
                onFocus={() => {
                  window.setTimeout(() => {
                    const target = listRef.current;
                    if (!target) return;
                    target.scrollTop = target.scrollHeight;
                  }, 80);
                }}
                placeholder={roomStatus === 'closed' ? '종료된 방입니다. 새로 열어주세요.' : '메시지 보내기...'}
                maxLength={500}
                disabled={loading || sending || roomStatus === 'closed'}
                className="flex-1 bg-transparent px-2 text-[16px] text-[#f2f6ff] placeholder:text-[#7f8ca5] outline-none disabled:opacity-60"
              />

              <button
                type="submit"
                disabled={!input.trim() || loading || sending || roomStatus === 'closed'}
                className="h-9 w-9 shrink-0 rounded-full grid place-items-center bg-[#7c3aed] text-white disabled:bg-[#394359] disabled:text-[#9aa6c0] transition-colors"
                aria-label="메시지 전송"
              >
                <Send size={16} />
              </button>
            </div>
          </form>
        </footer>
      </div>
    </div>
  );
}
