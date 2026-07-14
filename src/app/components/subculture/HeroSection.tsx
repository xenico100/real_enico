'use client';

import Image from 'next/image';
import { motion } from 'motion/react';

export function HeroSection() {
  const marqueeText = '• enicoveck aka 夢想人 •';
  const marqueeItems = Array.from({ length: 12 }, () => marqueeText);

  const handleEnterChaos = () => {
    document
      .getElementById('collection-section')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#f8f9fa] py-20">
      <div className="absolute inset-0 z-0 opacity-20 contrast-125">
        <Image
          src="https://images.unsplash.com/photo-1691922475317-5e2ce2bcd3c9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwaW5kdXN0cmlhbCUyMGJhc2VtZW50JTIwZ3J1bmdlJTIwdGV4dHVyZWQlMjBibGFjayUyMGFuZCUyMHdoaXRlfGVufDF8fHx8MTc3MTgyMDMxMHww&ixlib=rb-4.1.0&q=80&w=1080"
          alt="background"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
      </div>
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,transparent_10%,rgba(248,249,250,0.88)_72%)]" />

      <div className="absolute left-10 top-1/4 z-10 hidden md:block">
        <div className="max-w-xs rotate-[-5deg] border border-[#d1d5db] bg-white/90 shadow-md p-4">
          <p className="font-mono text-[10px] text-[#b8001f] uppercase leading-relaxed font-bold">
            &quot;xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx&quot;
          </p>
          <div className="mt-2 text-right text-[8px] text-[#111827]">{'/// xxxxx_xx'}</div>
        </div>
      </div>

      <div className="absolute bottom-1/3 right-10 z-10 hidden md:block">
        <div className="rotate-[3deg] bg-[#b8001f] p-1 shadow-lg">
          <Image
            src="https://images.unsplash.com/photo-1653372512929-5ac36eb22a73?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzb2FwJTIwYmFyJTIwcGluayUyMG1pbmltYWxpc3R8ZW58MXx8fHwxNzcxODIwMzEwfDA&ixlib=rb-4.1.0&q=80&w=1080"
            alt="soap"
            width={128}
            height={128}
            sizes="128px"
            className="h-32 w-32 object-cover grayscale transition-all duration-300 hover:grayscale-0"
          />
          <div className="bg-[#111827] text-white text-[10px] font-mono p-1 text-center mt-1 font-bold">
            99.44% 순도
          </div>
        </div>
      </div>

      <div className="relative z-20 w-full max-w-[100vw] px-4 text-center">
        <div className="mb-12 overflow-hidden border-y border-[#d1d5db] bg-white shadow-sm py-2">
          <motion.div
            className="flex w-max whitespace-nowrap font-mono text-xs text-[#4b5563] font-bold"
            animate={{ x: ['0%', '-50%'] }}
            transition={{ repeat: Infinity, duration: 20, ease: 'linear' }}
          >
            {[...marqueeItems, ...marqueeItems].map((text, index) => (
              <span key={index} className="mr-8">{text}</span>
            ))}
          </motion.div>
        </div>

        <div className="relative inline-block group">
          <h1 className="relative z-20 select-none bg-gradient-to-b from-[#111827] to-[#4b5563] bg-clip-text text-[18vw] font-heading font-black leading-[0.8] tracking-tighter text-transparent md:text-[15vw]">
            ENICO VECK
          </h1>
          <h1 className="pointer-events-none absolute left-0 top-0 z-10 text-[18vw] font-heading font-black leading-[0.8] tracking-tighter text-[#b8001f] opacity-0 transition-all duration-150 group-hover:-translate-y-1 group-hover:translate-x-2 group-hover:opacity-30 md:text-[15vw]">
            ENICO VECK
          </h1>
          <h1 className="pointer-events-none absolute left-0 top-0 z-10 text-[18vw] font-heading font-black leading-[0.8] tracking-tighter text-[#d93853] opacity-0 transition-all duration-150 group-hover:translate-y-1 group-hover:-translate-x-2 group-hover:opacity-25 md:text-[15vw]">
            ENICO VECK
          </h1>
        </div>

        <div className="mt-8 flex flex-col items-center gap-4">
          <div className="bg-[#b8001f] text-white px-4 py-1 font-heading text-xl uppercase tracking-widest -rotate-2 shadow-md">
            Warning: High-Stimulation Content
          </div>
          <p className="max-w-md font-mono text-xs leading-relaxed text-[#4b5563] font-semibold md:text-sm">
            어서오세요. 환영합니다.
          </p>
        </div>

        <button
          type="button"
          onClick={handleEnterChaos}
          className="mt-12 group relative inline-flex items-center justify-center px-8 py-4 bg-transparent overflow-hidden border-2 border-[#111827] hover:border-[#b8001f] transition-colors duration-300 shadow-sm"
        >
          <div className="absolute inset-0 w-0 bg-[#b8001f] transition-all duration-[250ms] ease-out group-hover:w-full opacity-100" />
          <span className="relative text-[#111827] group-hover:text-white font-mono font-bold tracking-widest text-sm z-10 flex items-center gap-2">
            ENTER HOPE <span className="group-hover:translate-x-2 transition-transform">→</span>
          </span>
        </button>

      </div>

      <div className="absolute bottom-10 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        <div className="w-[1px] h-20 bg-[#111827] animate-pulse" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-[#111827] font-bold">스크롤</span>
      </div>
    </section>
  );
}
