'use client';

import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AccountAuthPanel } from './AccountAuthPanel';
import { MyPagePanel } from './MyPagePanel';

interface InfoPopupProps {
  type: 'about' | 'contact' | 'account' | 'mypage';
  onClose: () => void;
}

export function InfoPopup({ type, onClose }: InfoPopupProps) {
  
  const content = {
    about: (
      <div className="space-y-8 font-mono">
        <div className="border border-[#00ffd1] p-6 bg-[#0a0a0a] relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-2 bg-[#00ffd1]" />
          <div className="absolute top-0 right-0 w-2 h-2 bg-[#00ffd1]" />
          <div className="absolute bottom-0 left-0 w-2 h-2 bg-[#00ffd1]" />
          <div className="absolute bottom-0 right-0 w-2 h-2 bg-[#00ffd1]" />
          
          <h3 className="text-[#00ffd1] text-xl font-bold mb-4 uppercase">/// 선언문</h3>
          <p className="text-sm leading-relaxed mb-4">
            우리는 세상이 만든 번쩍거리는 쓰레기다.
            에니코 벡은 브랜드가 아니다. 반응이다.
            소독되고 포장되고 팔려 나간 지금의 문화에 대한 반응이다.
          </p>
          <p className="text-sm leading-relaxed">
            우리는 옷을 파는 게 아니다. 무너질 때를 버틸 갑옷을 판다.
            오래된 세계의 잔해로 조립했다.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#111] p-4 border border-[#333]">
            <h4 className="text-xs text-[#666] mb-2 uppercase">규칙 01</h4>
            <p className="text-sm">에니코 벡에 대해 떠들지 마라.</p>
          </div>
          <div className="bg-[#111] p-4 border border-[#333]">
            <h4 className="text-xs text-[#666] mb-2 uppercase">규칙 02</h4>
            <p className="text-sm">진짜로, 에니코 벡에 대해 떠들지 마라.</p>
          </div>
          <div className="bg-[#111] p-4 border border-[#333]">
            <h4 className="text-xs text-[#666] mb-2 uppercase">규칙 03</h4>
            <p className="text-sm">누가 "멈춰"라고 하거나 버티지 못하면 거래는 끝이다.</p>
          </div>
          <div className="bg-[#111] p-4 border border-[#333]">
            <h4 className="text-xs text-[#666] mb-2 uppercase">규칙 04</h4>
            <p className="text-sm">한 사람당 두 개까지만 허용한다.</p>
          </div>
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
              <p className="text-lg text-[#00ffd1] hover:underline cursor-pointer">join@enicoveck.com</p>
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
                경고: 약속 없이 방문하지 마라.
                승인되지 않은 인원은 차단된다.
              </p>
            </div>
          </div>
        </div>
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
            type === 'mypage' ? 'max-w-4xl' : type === 'account' ? 'max-w-3xl' : 'max-w-2xl'
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
                     ? '신원_프로토콜'
                     : '마이페이지'}
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
