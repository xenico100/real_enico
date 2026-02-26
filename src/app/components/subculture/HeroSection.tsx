'use client';

import { motion, useScroll, useTransform } from 'motion/react';
import { useState, useEffect, useRef } from 'react';

export function HeroSection() {
  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 500], [0, 200]);
  const y2 = useTransform(scrollY, [0, 500], [0, -100]);
  
  const [glitchText, setGlitchText] = useState("ANARCHĒ");
  
  // Random text flicker
  useEffect(() => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$#@%&";
    const interval = setInterval(() => {
      if (Math.random() > 0.9) {
        const randomChar = chars[Math.floor(Math.random() * chars.length)];
        const pos = Math.floor(Math.random() * 7);
        const arr = "ANARCHĒ".split('');
        arr[pos] = randomChar;
        setGlitchText(arr.join(''));
        setTimeout(() => setGlitchText("ANARCHĒ"), 50);
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const handleEnterChaos = () => {
    document
      .getElementById('collection-section')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center bg-[#050505] overflow-hidden py-20">
      
      {/* Background Video/Image Placeholder - Gritty Industrial */}
      <div className="absolute inset-0 z-0 opacity-40 mix-blend-hard-light grayscale contrast-125">
        <img 
          src="https://images.unsplash.com/photo-1691922475317-5e2ce2bcd3c9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwaW5kdXN0cmlhbCUyMGJhc2VtZW50JTIwZ3J1bmdlJTIwdGV4dHVyZWQlMjBibGFjayUyMGFuZCUyMHdoaXRlfGVufDF8fHx8MTc3MTgyMDMxMHww&ixlib=rb-4.1.0&q=80&w=1080"
          className="w-full h-full object-cover"
          alt="background"
        />
      </div>

      {/* Floating Elements */}
      <motion.div style={{ y: y1 }} className="absolute top-1/4 left-10 z-10 hidden md:block">
        <div className="border border-[#00ffd1] p-4 bg-black/80 backdrop-blur-sm max-w-xs rotate-[-5deg]">
          <p className="font-mono text-[10px] text-[#00ffd1] uppercase leading-relaxed">
            "It's only after we've lost everything that we're free to do anything."
          </p>
          <div className="mt-2 text-right text-[8px] text-white">/// RULE_01</div>
        </div>
      </motion.div>

      <motion.div style={{ y: y2 }} className="absolute bottom-1/3 right-10 z-10 hidden md:block">
        <div className="bg-[#00ffd1] p-1 rotate-[3deg]">
          <img 
            src="https://images.unsplash.com/photo-1653372512929-5ac36eb22a73?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzb2FwJTIwYmFyJTIwcGluayUyMG1pbmltYWxpc3R8ZW58MXx8fHwxNzcxODIwMzEwfDA&ixlib=rb-4.1.0&q=80&w=1080"
            className="w-32 h-32 object-cover grayscale hover:grayscale-0 transition-all duration-300 mix-blend-multiply"
            alt="soap"
          />
          <div className="bg-black text-white text-[10px] font-mono p-1 text-center mt-1">
            99.44% PURE
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="relative z-20 text-center w-full max-w-[100vw] px-4">
        
        {/* Marquee Top */}
        <div className="w-full overflow-hidden border-y border-[#333] py-2 mb-12 bg-black">
          <motion.div 
            animate={{ x: [0, -1000] }}
            transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
            className="whitespace-nowrap flex gap-8 font-mono text-xs text-[#666]"
          >
            {Array(20).fill("CONSUME • REPRODUCE • OBEY • SUBMIT • ").map((text, i) => (
              <span key={i}>{text}</span>
            ))}
          </motion.div>
        </div>

        {/* Hero Title */}
        <div className="relative inline-block group">
          <h1 className="text-[18vw] md:text-[15vw] font-heading font-black tracking-tighter leading-[0.8] text-transparent bg-clip-text bg-gradient-to-b from-[#e5e5e5] to-[#666] select-none mix-blend-difference z-20 relative">
            {glitchText}
          </h1>
          
          {/* Glitch Shadows */}
          <h1 className="absolute top-0 left-0 text-[18vw] md:text-[15vw] font-heading font-black tracking-tighter leading-[0.8] text-[#00ffd1] opacity-0 group-hover:opacity-40 group-hover:translate-x-2 group-hover:-translate-y-1 transition-all duration-75 mix-blend-screen pointer-events-none z-10">
            {glitchText}
          </h1>
          <h1 className="absolute top-0 left-0 text-[18vw] md:text-[15vw] font-heading font-black tracking-tighter leading-[0.8] text-[#00ffff] opacity-0 group-hover:opacity-40 group-hover:-translate-x-2 group-hover:translate-y-1 transition-all duration-75 mix-blend-screen pointer-events-none z-10">
            {glitchText}
          </h1>
        </div>

        {/* Subtext */}
        <div className="mt-8 flex flex-col items-center gap-4">
          <div className="bg-[#00ffd1] text-black px-4 py-1 font-heading text-xl uppercase tracking-widest -rotate-2">
            Warning: Graphic Content
          </div>
          <p className="font-mono text-xs md:text-sm max-w-md text-[#888] leading-relaxed">
            WE ARE THE MIDDLE CHILDREN OF HISTORY. NO PURPOSE OR PLACE. WE HAVE NO GREAT WAR. NO GREAT DEPRESSION. OUR GREAT WAR'S A SPIRITUAL WAR...
          </p>
        </div>

        {/* Action Button */}
        <button
          type="button"
          onClick={handleEnterChaos}
          className="mt-12 group relative inline-flex items-center justify-center px-8 py-4 bg-transparent overflow-hidden border-2 border-[#e5e5e5] hover:border-[#00ffd1] transition-colors duration-300"
        >
          <div className="absolute inset-0 w-0 bg-[#00ffd1] transition-all duration-[250ms] ease-out group-hover:w-full opacity-100" />
          <span className="relative text-white group-hover:text-black font-mono font-bold tracking-widest text-sm z-10 flex items-center gap-2">
            ENTER CHAOS <span className="group-hover:translate-x-2 transition-transform">→</span>
          </span>
        </button>

      </div>

      {/* Scroll Down Hint */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 mix-blend-difference">
        <div className="w-[1px] h-20 bg-white animate-pulse" />
        <span className="font-mono text-[10px] uppercase tracking-widest">Scroll</span>
      </div>
    </section>
  );
}
