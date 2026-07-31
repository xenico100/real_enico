'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/app/context/AuthContext';

const MyPagePanel = dynamic(
  () => import('./MyPagePanel').then((module) => module.MyPagePanel),
  { ssr: false, loading: () => <p role="status">마이페이지를 불러오는 중입니다...</p> },
);

interface InfoPopupProps {
  type: 'about' | 'contact' | 'mypage';
  onClose: () => void;
  initialMyPageTab?: 'overview' | 'orders' | 'saved' | 'cart' | 'profile' | 'dailyStats' | 'members' | 'adminOrders';
}

const CONTACT_EMAIL = 'morba9850@gmail.com';
const DEFAULT_CONTACT_CATEGORY = '멤버십/맞춤제작';

export function InfoPopup({ type, onClose, initialMyPageTab }: InfoPopupProps) {
  const { isAuthenticated, isAuthReady } = useAuth();
  const [contactCategory, setContactCategory] = useState(DEFAULT_CONTACT_CATEGORY);
  const [contactName, setContactName] = useState('');
  const [contactReplyEmail, setContactReplyEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactSubject, setContactSubject] = useState('');
  const [contactBody, setContactBody] = useState('');
  const [isContactSubmitting, setIsContactSubmitting] = useState(false);
  const [contactMessage, setContactMessage] = useState<string | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [onClose]);

  const handleSendContact = async (event: React.FormEvent) => {
    event.preventDefault();
    setContactMessage(null);
    setContactError(null);

    const category = contactCategory.trim() || DEFAULT_CONTACT_CATEGORY;
    const name = contactName.trim();
    const replyEmail = contactReplyEmail.trim();
    const phone = contactPhone.trim();
    const subject = contactSubject.trim();
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
      setContactSubject('');
      setContactBody('');
    } catch (error) {
      setContactError(error instanceof Error ? error.message : '문의 전송 실패');
    } finally {
      setIsContactSubmitting(false);
    }
  };

  const myPageTitle =
    isAuthenticated || !isAuthReady ? '마이페이지' : '로그인 / 주문조회';

  const content = {
    about: (
      <div className="space-y-8 font-mono">
        <div className="border border-[#b8001f] p-6 bg-white shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-2 bg-[#b8001f]" />
          <div className="absolute top-0 right-0 w-2 h-2 bg-[#b8001f]" />
          <div className="absolute bottom-0 left-0 w-2 h-2 bg-[#b8001f]" />
          <div className="absolute bottom-0 right-0 w-2 h-2 bg-[#b8001f]" />
          
          <h3 className="text-[#b8001f] text-xl font-bold mb-4 uppercase">브랜드 소개</h3>
          <p className="text-sm leading-relaxed mb-4 text-[#374151]">
            한국의 다양한 서브컬처를 하나의 컬렉션으로 기록합니다.
          </p>
          <p className="text-sm leading-relaxed text-[#374151]">
            모든 제품은 디자이너가 직접 패턴 설계부터 제작까지 전 과정을 손수 완성하는 핸드메이드 피스로, 각 컬렉션은 하나의 앨범처럼 하나의 이야기와 시대의 감각을 담아 선보입니다.
          </p>
        </div>
      </div>
    ),
    contact: (
      <div className="space-y-8 font-mono">
        <form
          onSubmit={handleSendContact}
          className="border border-[#d1d5db] p-6 bg-white shadow-sm space-y-4"
        >
          <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#d1d5db]">
            <div>
              <h4 className="text-sm font-bold uppercase text-[#b8001f]">의뢰 게시글 작성</h4>
              <p className="text-xs text-[#6b7280] mt-2 font-medium">
                작성 후 전송하면 `{CONTACT_EMAIL}`로 직접 도착합니다.
              </p>
            </div>
            <p className="text-[10px] text-[#4b5563] uppercase tracking-widest font-bold">문의 글쓰기</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label htmlFor="contact-category" className="block text-[10px] text-[#4b5563] font-bold mb-2 uppercase">문의 유형</label>
              <select
                id="contact-category"
                value={contactCategory}
                onChange={(event) => setContactCategory(event.target.value)}
                className="w-full bg-[#f8f9fa] border border-[#d1d5db] py-3 px-3 text-sm focus:outline-none focus:border-[#b8001f] text-[#111827] font-medium"
                required
              >
                <option>멤버십/맞춤제작</option>
                <option>협업/제휴</option>
                <option>상품 문의</option>
                <option>기타 문의</option>
              </select>
            </div>
            <div>
              <label htmlFor="contact-name" className="block text-[10px] text-[#4b5563] font-bold mb-2 uppercase">작성자</label>
              <input
                id="contact-name"
                type="text"
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                className="w-full bg-[#f8f9fa] border border-[#d1d5db] py-3 px-3 text-sm focus:outline-none focus:border-[#b8001f] text-[#111827] font-medium"
                placeholder="성함"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label htmlFor="contact-email" className="block text-[10px] text-[#4b5563] font-bold mb-2 uppercase">회신 이메일</label>
              <input
                id="contact-email"
                type="email"
                value={contactReplyEmail}
                onChange={(event) => setContactReplyEmail(event.target.value)}
                className="w-full bg-[#f8f9fa] border border-[#d1d5db] py-3 px-3 text-sm focus:outline-none focus:border-[#b8001f] text-[#111827] font-medium"
                placeholder="회신 받을 이메일"
                required
              />
            </div>
            <div>
              <label htmlFor="contact-phone" className="block text-[10px] text-[#4b5563] font-bold mb-2 uppercase">연락처 (선택)</label>
              <input
                id="contact-phone"
                type="tel"
                value={contactPhone}
                onChange={(event) => setContactPhone(event.target.value)}
                className="w-full bg-[#f8f9fa] border border-[#d1d5db] py-3 px-3 text-sm focus:outline-none focus:border-[#b8001f] text-[#111827] font-medium"
                placeholder="010-0000-0000"
              />
            </div>
          </div>

          <div>
            <label htmlFor="contact-subject" className="block text-[10px] text-[#4b5563] font-bold mb-2 uppercase">제목</label>
            <input
              id="contact-subject"
              type="text"
              value={contactSubject}
              onChange={(event) => setContactSubject(event.target.value)}
              className="w-full bg-[#f8f9fa] border border-[#d1d5db] py-3 px-3 text-sm focus:outline-none focus:border-[#b8001f] text-[#111827] font-medium"
              placeholder="게시글 제목"
              required
            />
          </div>

          <div>
            <label htmlFor="contact-body" className="block text-[10px] text-[#4b5563] font-bold mb-2 uppercase">내용</label>
            <textarea
              id="contact-body"
              value={contactBody}
              onChange={(event) => setContactBody(event.target.value)}
              rows={9}
              className="w-full bg-[#f8f9fa] border border-[#d1d5db] py-3 px-3 text-sm focus:outline-none focus:border-[#b8001f] text-[#111827] resize-y font-medium"
              placeholder="문의/제안 내용을 작성하세요"
              required
            />
          </div>

          {(contactMessage || contactError) && (
            <div
              role={contactError ? 'alert' : 'status'}
              aria-live={contactError ? 'assertive' : 'polite'}
              className={`border p-3 text-xs font-semibold ${
                contactError
                  ? 'border-red-500 bg-red-50 text-red-800'
                  : 'border-[#b8001f]/40 bg-[#fff1f2] text-[#8f0018]'
              }`}
            >
              {contactError || contactMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={isContactSubmitting}
            className="w-full py-3 border border-[#b8001f] text-[#b8001f] hover:bg-[#b8001f] hover:text-white transition-colors text-xs uppercase tracking-widest font-bold shadow-sm"
          >
            {isContactSubmitting ? '전송 중...' : '게시글 전송'}
          </button>
        </form>
      </div>
    ),
    mypage: (
      <MyPagePanel onBack={onClose} initialTab={initialMyPageTab} />
    )
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={`fixed inset-0 z-[100] flex bg-white/90 backdrop-blur-xl ${
          type === 'mypage'
            ? 'items-start justify-center overflow-y-auto overscroll-contain px-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)] md:items-center md:overflow-hidden md:p-4'
            : 'items-center justify-center p-4'
        }`}
        onClick={onClose}
      >
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="info-popup-title"
          tabIndex={-1}
          initial={{ scale: 0.9, opacity: 0, y: 50 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 50 }}
          className={`relative w-full ${
            type === 'mypage'
              ? isAuthenticated
                ? 'max-w-[min(1080px,92vw)]'
                : 'max-w-[min(940px,92vw)]'
              : 'max-w-2xl'
          } flex ${
            type === 'mypage' ? 'min-h-[92dvh] md:h-[92vh] md:max-h-[92vh]' : 'max-h-[92vh]'
          } flex-col border border-[#d1d5db] bg-white text-[#111827] shadow-2xl shadow-[#b8001f]/10 ${
            type === 'mypage' ? 'overflow-visible md:overflow-hidden' : 'overflow-hidden'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="relative min-h-[76px] border-b border-[#d1d5db] bg-[#f8f9fa] px-4 py-3 md:h-16 md:px-6 md:py-0">
             <div className="flex min-w-0 flex-col gap-2 pr-14 md:h-full md:flex-row md:items-center md:gap-3">
               {type === 'mypage' && (
                 <button
                   type="button"
                   aria-label="마이페이지 닫기"
                   onClick={onClose}
                   className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-[#d1d5db] bg-white px-2.5 py-1.5 text-xs text-[#111827] font-semibold transition-colors hover:border-[#b8001f] hover:text-[#b8001f] shadow-sm"
                 >
                   <ChevronLeft size={14} />
                   뒤로가기
                 </button>
               )}
               <span
                 id="info-popup-title"
                 className="font-heading text-xl uppercase tracking-tighter text-[#111827] md:text-2xl truncate font-black"
               >
                 {type === 'about'
                   ? 'ENICO VECK'
                     : type === 'contact'
                       ? '의뢰_접수'
                       : myPageTitle}
               </span>
             </div>
             <button
               type="button"
               aria-label="팝업 닫기"
               onClick={onClose}
               className="absolute right-4 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d1d5db] bg-white text-[#111827] transition-colors hover:border-[#b8001f] hover:text-[#b8001f] md:top-1/2 md:right-6 md:-translate-y-1/2 shadow-sm"
             >
               <X size={24} />
             </button>
          </div>

          {/* Content Body */}
          <div
            className={`min-h-0 ${
              type === 'mypage'
                ? 'overflow-visible p-3 md:min-h-0 md:flex-1 md:overflow-hidden md:p-5'
                : 'max-h-[70vh] overflow-y-auto p-4 md:p-8'
            }`}
          >
            {content[type]}
          </div>

          {/* Footer Decoration */}
          {type !== 'mypage' && (
            <div className="h-2 bg-[repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6_10px,#e5e7eb_10px,#e5e7eb_20px)] border-t border-[#d1d5db]" />
          )}
          
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
