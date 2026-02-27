'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AccountAuthPanel } from './AccountAuthPanel';
import { MyPagePanel } from './MyPagePanel';
import { useAuth } from '@/app/context/AuthContext';

interface InfoPopupProps {
  type: 'about' | 'contact' | 'account' | 'mypage';
  onClose: () => void;
}

const CONTACT_EMAIL = 'morba9850@gmail.com';
const DEFAULT_CONTACT_SUBJECT = '멤버십 멤버를 위한 맞춤제작 건의';
const DEFAULT_CONTACT_BODY =
  '멤버십 멤버를 위한 맞춤제작 건의를 드립니다.\n\n요청 내용:\n-\n\n예산/일정:\n-\n';

export function InfoPopup({ type, onClose }: InfoPopupProps) {
  const { isAuthenticated } = useAuth();
  const [contactName, setContactName] = useState('');
  const [contactReplyEmail, setContactReplyEmail] = useState('');
  const [contactSubject, setContactSubject] = useState(DEFAULT_CONTACT_SUBJECT);
  const [contactBody, setContactBody] = useState(DEFAULT_CONTACT_BODY);
  const [isContactSubmitting, setIsContactSubmitting] = useState(false);
  const [contactMessage, setContactMessage] = useState<string | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);

  const handleSendContact = async (event: React.FormEvent) => {
    event.preventDefault();
    setContactMessage(null);
    setContactError(null);

    const name = contactName.trim();
    const replyEmail = contactReplyEmail.trim();
    const subject = contactSubject.trim() || DEFAULT_CONTACT_SUBJECT;
    const body = contactBody.trim();

    if (!name || !replyEmail || !subject || !body) {
      setContactError('성함, 회신 이메일, 제목, 내용을 모두 입력해 주세요.');
      return;
    }

    setIsContactSubmitting(true);
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, replyEmail, subject, body }),
      });

      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message || '문의 전송 실패');
      }

      setContactMessage(payload.message || '문의가 전송되었습니다.');
      setContactName('');
      setContactReplyEmail('');
      setContactSubject(DEFAULT_CONTACT_SUBJECT);
      setContactBody(DEFAULT_CONTACT_BODY);
    } catch (error) {
      setContactError(error instanceof Error ? error.message : '문의 전송 실패');
    } finally {
      setIsContactSubmitting(false);
    }
  };

  const myPageTitle = isAuthenticated ? '마이페이지' : '로그인 / 회원가입';

  const content = {
    about: (
      <div className="space-y-8 font-mono">
        <div className="border border-[#00ffd1] p-6 bg-[#0a0a0a] relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-2 bg-[#00ffd1]" />
          <div className="absolute top-0 right-0 w-2 h-2 bg-[#00ffd1]" />
          <div className="absolute bottom-0 left-0 w-2 h-2 bg-[#00ffd1]" />
          <div className="absolute bottom-0 right-0 w-2 h-2 bg-[#00ffd1]" />
          
          <h3 className="text-[#00ffd1] text-xl font-bold mb-4 uppercase">브랜드 소개</h3>
          <p className="text-sm leading-relaxed mb-4">
            enico veck은 서브컬처를 좋아하는 사람들,
            그리고 각자의 특별함을 가진 사람들을 모아
            하나의 가족처럼 연결하려는 디자이너 브랜드입니다.
          </p>
          <p className="text-sm leading-relaxed">
            옷을 통해 취향과 정체성을 함께 나누고,
            오래 함께할 수 있는 커뮤니티를 만드는 것을 목표로 합니다.
          </p>
        </div>
      </div>
    ),
    contact: (
      <div className="space-y-8 font-mono">
        <div className="border border-[#333] p-8 bg-[#0a0a0a]">
          <h3 className="text-xl font-bold mb-6 uppercase">/// 접선 센터</h3>
          
          <div className="space-y-6">
            <div>
              <label className="block text-[10px] text-[#666] mb-2 uppercase">신호 주파수 (이메일)</label>
              <p className="text-lg text-[#00ffd1] hover:underline cursor-pointer">{CONTACT_EMAIL}</p>
              <p className="text-xs text-[#999] mt-2">
                나와 함께 수익화를 진행하고 싶다면 아래 메일 작성 폼으로 제안 내용을 보내주세요.
              </p>
            </div>
            
            <div>
              <label className="block text-[10px] text-[#666] mb-2 uppercase">오프라인 드롭 포인트</label>
              <p className="text-sm text-[#e5e5e5]">
                페이퍼 스트리트 420<br/>
                윌밍턴, 델라웨어 19886
              </p>
            </div>

            <div className="pt-6 border-t border-[#333]">
              <p className="text-xs text-[#888]">
                방문 전 사전 예약과 일정 확인을 부탁드립니다.
                승인되지 않은 방문은 응대가 어려울 수 있습니다.
              </p>
            </div>
          </div>
        </div>

        <form
          onSubmit={handleSendContact}
          className="border border-[#333] p-6 bg-[#0a0a0a] space-y-4"
        >
          <h4 className="text-sm font-bold uppercase text-[#00ffd1]">메일 작성</h4>
          <p className="text-xs text-[#999]">
            사이트 안에서 바로 문의를 전송합니다. 수신자는 `morba9850@gmail.com`입니다.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
              className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
              placeholder="성함"
              required
            />
            <input
              type="email"
              value={contactReplyEmail}
              onChange={(event) => setContactReplyEmail(event.target.value)}
              className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
              placeholder="회신 받을 이메일"
              required
            />
          </div>

          <input
            type="text"
            value={contactSubject}
            onChange={(event) => setContactSubject(event.target.value)}
            className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
            placeholder="메일 제목"
            required
          />

          <textarea
            value={contactBody}
            onChange={(event) => setContactBody(event.target.value)}
            rows={7}
            className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5] resize-y"
            placeholder="문의/제안 내용을 작성하세요"
            required
          />

          {(contactMessage || contactError) && (
            <div
              className={`border p-3 text-xs ${
                contactError
                  ? 'border-red-700 bg-red-950/20 text-red-300'
                  : 'border-[#00ffd1]/40 bg-[#00ffd1]/5 text-[#bafff0]'
              }`}
            >
              {contactError || contactMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={isContactSubmitting}
            className="w-full py-3 border border-[#00ffd1] text-[#00ffd1] hover:bg-[#00ffd1] hover:text-black transition-colors text-xs uppercase tracking-widest"
          >
            {isContactSubmitting ? '전송 중...' : '문의 전송'}
          </button>
        </form>
      </div>
    ),
    account: (
      <AccountAuthPanel />
    ),
    mypage: (
      <MyPagePanel />
    )
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[100] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 50 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 50 }}
          className={`relative w-full ${
            type === 'mypage'
              ? isAuthenticated
                ? 'max-w-4xl'
                : 'max-w-3xl'
              : type === 'account'
                ? 'max-w-3xl'
                : 'max-w-2xl'
          } bg-[#050505] border border-[#333] shadow-2xl shadow-[#00ffd1]/5 overflow-hidden`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="h-16 border-b border-[#333] flex items-center justify-between px-6 bg-[#0a0a0a]">
             <span className="font-heading text-2xl uppercase tracking-tighter text-[#e5e5e5]">
               {type === 'about'
                 ? '프로젝트_메이헴'
                   : type === 'contact'
                     ? '통신_링크'
                   : type === 'account'
                     ? '로그인 / 회원가입'
                     : myPageTitle}
             </span>
             <button onClick={onClose} className="text-[#666] hover:text-[#00ffd1] transition-colors">
               <X size={24} />
             </button>
          </div>

          {/* Content Body */}
          <div className="p-8 max-h-[70vh] overflow-y-auto">
            {content[type]}
          </div>

          {/* Footer Decoration */}
          <div className="h-2 bg-[repeating-linear-gradient(45deg,#000,#000_10px,#333_10px,#333_20px)] border-t border-[#333]" />
          
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
