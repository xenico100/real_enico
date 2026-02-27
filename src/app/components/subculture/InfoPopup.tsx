'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MyPagePanel } from './MyPagePanel';
import { useAuth } from '@/app/context/AuthContext';

interface InfoPopupProps {
  type: 'about' | 'contact' | 'mypage';
  onClose: () => void;
}

const CONTACT_EMAIL = 'morba9850@gmail.com';
const DEFAULT_CONTACT_SUBJECT = '멤버십 멤버를 위한 맞춤제작 건의';
const DEFAULT_CONTACT_BODY =
  '멤버십 멤버를 위한 맞춤제작 건의를 드립니다.\n\n요청 내용:\n-\n\n예산/일정:\n-\n';
const DEFAULT_CONTACT_CATEGORY = '멤버십/맞춤제작';

export function InfoPopup({ type, onClose }: InfoPopupProps) {
  const { isAuthenticated } = useAuth();
  const [contactCategory, setContactCategory] = useState(DEFAULT_CONTACT_CATEGORY);
  const [contactName, setContactName] = useState('');
  const [contactReplyEmail, setContactReplyEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactSubject, setContactSubject] = useState(DEFAULT_CONTACT_SUBJECT);
  const [contactBody, setContactBody] = useState(DEFAULT_CONTACT_BODY);
  const [isContactSubmitting, setIsContactSubmitting] = useState(false);
  const [contactMessage, setContactMessage] = useState<string | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);

  const handleSendContact = async (event: React.FormEvent) => {
    event.preventDefault();
    setContactMessage(null);
    setContactError(null);

    const category = contactCategory.trim() || DEFAULT_CONTACT_CATEGORY;
    const name = contactName.trim();
    const replyEmail = contactReplyEmail.trim();
    const phone = contactPhone.trim();
    const subject = contactSubject.trim() || DEFAULT_CONTACT_SUBJECT;
    const body = contactBody.trim();

    if (!name || !replyEmail || !subject || !body || !category) {
      setContactError('유형, 성함, 회신 이메일, 제목, 내용을 모두 입력해 주세요.');
      return;
    }

    setIsContactSubmitting(true);
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, name, replyEmail, phone, subject, body }),
      });

      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message || '문의 전송 실패');
      }

      setContactMessage(payload.message || '문의가 전송되었습니다.');
      setContactCategory(DEFAULT_CONTACT_CATEGORY);
      setContactName('');
      setContactReplyEmail('');
      setContactPhone('');
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
        <form
          onSubmit={handleSendContact}
          className="border border-[#333] p-6 bg-[#0a0a0a] space-y-4"
        >
          <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#222]">
            <div>
              <h4 className="text-sm font-bold uppercase text-[#00ffd1]">연락 게시글 작성</h4>
              <p className="text-xs text-[#999] mt-2">
                작성 후 전송하면 `{CONTACT_EMAIL}`로 직접 도착합니다.
              </p>
            </div>
            <p className="text-[10px] text-[#666] uppercase tracking-widest">문의 글쓰기</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-[#666] mb-2 uppercase">문의 유형</label>
              <select
                value={contactCategory}
                onChange={(event) => setContactCategory(event.target.value)}
                className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
                required
              >
                <option>멤버십/맞춤제작</option>
                <option>협업/제휴</option>
                <option>상품 문의</option>
                <option>기타 문의</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-[#666] mb-2 uppercase">작성자</label>
              <input
                type="text"
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
                placeholder="성함"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-[#666] mb-2 uppercase">회신 이메일</label>
              <input
                type="email"
                value={contactReplyEmail}
                onChange={(event) => setContactReplyEmail(event.target.value)}
                className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
                placeholder="회신 받을 이메일"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] text-[#666] mb-2 uppercase">연락처 (선택)</label>
              <input
                type="tel"
                value={contactPhone}
                onChange={(event) => setContactPhone(event.target.value)}
                className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
                placeholder="010-0000-0000"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-[#666] mb-2 uppercase">제목</label>
            <input
              type="text"
              value={contactSubject}
              onChange={(event) => setContactSubject(event.target.value)}
              className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5]"
              placeholder="게시글 제목"
              required
            />
          </div>

          <div>
            <label className="block text-[10px] text-[#666] mb-2 uppercase">내용</label>
            <textarea
              value={contactBody}
              onChange={(event) => setContactBody(event.target.value)}
              rows={9}
              className="w-full bg-black border border-[#333] py-3 px-3 text-sm focus:outline-none focus:border-[#00ffd1] text-[#e5e5e5] resize-y"
              placeholder="문의/제안 내용을 작성하세요"
              required
            />
          </div>

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
            {isContactSubmitting ? '전송 중...' : '게시글 전송'}
          </button>
        </form>
      </div>
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
