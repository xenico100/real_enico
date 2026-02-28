'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
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

function shortenUserId(userId: string) {
  if (!userId) return '';
  return userId.replace(/-/g, '').slice(0, 8);
}

export function RandomChatModal({ open, onClose }: RandomChatModalProps) {
  const { roomId, messages, loading, error, myDisplayName, myUserId, memberCount, roomStatus, sendMessage } =
    useRandomChat(open);

  const [input, setInput] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const statusText = useMemo(() => {
    if (loading) return '매칭중';
    if (roomStatus === 'closed') return '방 종료';
    if (roomId) return '방 입장 완료';
    return '대기중';
  }, [loading, roomId, roomStatus]);

  useEffect(() => {
    if (!open) return;
    const target = listRef.current;
    if (!target) return;
    target.scrollTop = target.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    if (!open) {
      setInput('');
      setSendError(null);
      setSending(false);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="단체랜덤채팅"
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] border border-[#333] bg-[#080808] text-[#e5e5e5] shadow-[0_0_30px_rgba(0,0,0,0.45)] flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-4 md:px-6 py-4 border-b border-[#333] flex items-start justify-between gap-3">
          <div>
            <p className="font-heading text-2xl md:text-3xl uppercase tracking-tight">단체랜덤채팅</p>
            <div className="mt-1 text-[11px] md:text-xs font-mono text-[#8f8f8f] space-y-0.5">
              <p>
                상태: <span className="text-[#00ffd1]">{statusText}</span>
              </p>
              <p>
                인원: <span className="text-[#e5e5e5]">{memberCount}</span>명 (인원 상관없이 채팅 가능)
              </p>
              <p>
                닉네임: <span className="text-[#e5e5e5]">{myDisplayName || '익명_0000'}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="border border-[#333] bg-[#111] p-2 text-[#a5a5a5] hover:text-[#00ffd1] hover:border-[#00ffd1] transition-colors"
            aria-label="채팅 닫기"
          >
            <X size={18} />
          </button>
        </div>

        <div ref={listRef} className="flex-1 min-h-[280px] overflow-y-auto px-4 md:px-6 py-4 space-y-3 bg-[#050505]">
          {messages.length === 0 ? (
            <p className="font-mono text-xs text-[#777]">{loading ? '채팅방 연결 중...' : '아직 메시지가 없습니다.'}</p>
          ) : (
            messages.map((item) => {
              const mine = item.userId === myUserId;
              return (
                <div key={item.id} className={`max-w-[88%] ${mine ? 'ml-auto' : 'mr-auto'}`}>
                  <div
                    className={`border px-3 py-2 ${
                      mine
                        ? 'border-[#00ffd1]/60 bg-[#022d26] text-[#e9fffb]'
                        : 'border-[#2f2f2f] bg-[#101010] text-[#e5e5e5]'
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-3 text-[10px] font-mono text-[#8a8a8a]">
                      <span>{mine ? myDisplayName || '나' : `익명_${shortenUserId(item.userId)}`}</span>
                      <span>{formatTime(item.createdAt)}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap break-words">{item.message}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-[#333] px-4 md:px-6 py-4 bg-[#090909]">
          {error ? <p className="mb-2 text-xs text-[#ff9b9b]">{error}</p> : null}
          {sendError ? <p className="mb-2 text-xs text-[#ff9b9b]">{sendError}</p> : null}

          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const text = input.trim();
              if (!text || loading || sending || roomStatus === 'closed') return;

              setSendError(null);
              setSending(true);
              try {
                await sendMessage(text);
                setInput('');
              } catch (nextError) {
                setSendError(nextError instanceof Error ? nextError.message : '메시지 전송 실패');
              } finally {
                setSending(false);
              }
            }}
            className="flex gap-2"
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={roomStatus === 'closed' ? '종료된 방입니다. 새로 열어주세요.' : '메시지를 입력하세요'}
              maxLength={500}
              disabled={loading || sending || roomStatus === 'closed'}
              className="flex-1 border border-[#333] bg-black px-3 py-2 text-sm outline-none focus:border-[#00ffd1] disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading || sending || roomStatus === 'closed'}
              className="border border-[#00ffd1] px-4 py-2 text-xs font-mono uppercase tracking-widest text-[#00ffd1] hover:bg-[#00ffd1] hover:text-black transition-colors disabled:border-[#2b4a46] disabled:text-[#4f7d77] disabled:hover:bg-transparent disabled:hover:text-[#4f7d77]"
            >
              {sending ? '전송중' : '전송'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
