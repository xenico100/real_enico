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
          
          <h3 className="text-[#00ffd1] text-xl font-bold mb-4 uppercase">/// Manifesto</h3>
          <p className="text-sm leading-relaxed mb-4">
            We are the all-singing, all-dancing crap of the world.
            ENICO VECK is not a brand. It is a reaction.
            A reaction to the sanitized, packaged, and sold-out culture of today.
          </p>
          <p className="text-sm leading-relaxed">
            We don't sell clothes. We sell armor for the inevitable collapse.
            Constructed from the debris of the old world.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#111] p-4 border border-[#333]">
            <h4 className="text-xs text-[#666] mb-2 uppercase">Rule 01</h4>
            <p className="text-sm">You do not talk about ENICO VECK.</p>
          </div>
          <div className="bg-[#111] p-4 border border-[#333]">
            <h4 className="text-xs text-[#666] mb-2 uppercase">Rule 02</h4>
            <p className="text-sm">You DO NOT talk about ENICO VECK.</p>
          </div>
          <div className="bg-[#111] p-4 border border-[#333]">
            <h4 className="text-xs text-[#666] mb-2 uppercase">Rule 03</h4>
            <p className="text-sm">If someone says "Stop" or goes limp, the sale is over.</p>
          </div>
          <div className="bg-[#111] p-4 border border-[#333]">
            <h4 className="text-xs text-[#666] mb-2 uppercase">Rule 04</h4>
            <p className="text-sm">Only two items to a customer.</p>
          </div>
        </div>
      </div>
    ),
    contact: (
      <div className="space-y-8 font-mono">
        <div className="border border-[#333] p-8 bg-[#0a0a0a]">
          <h3 className="text-xl font-bold mb-6 uppercase">/// Recruitment Center</h3>
          
          <div className="space-y-6">
            <div>
              <label className="block text-[10px] text-[#666] mb-2 uppercase">Signal Frequency (Email)</label>
              <p className="text-lg text-[#00ffd1] hover:underline cursor-pointer">join@enicoveck.com</p>
            </div>
            
            <div>
              <label className="block text-[10px] text-[#666] mb-2 uppercase">Physical Drop Point</label>
              <p className="text-sm text-[#e5e5e5]">
                420 Paper Street<br/>
                Wilmington, DE 19886
              </p>
            </div>

            <div className="pt-6 border-t border-[#333]">
              <p className="text-xs text-[#888]">
                WARNING: Do not attempt to visit without an appointment.
                Unauthorized personnel will be neutralized.
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
                 ? 'PROJECT_MAYHEM'
                 : type === 'contact'
                   ? 'COMM_LINK'
                   : type === 'account'
                     ? 'IDENTITY_PROTOCOL'
                     : 'MY_PAGE'}
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
