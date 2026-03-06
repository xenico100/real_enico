'use client';

import Image from 'next/image';

export function HeroSection() {
  const handleEnterChaos = () => {
    document
      .getElementById('collection-section')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#050505] py-20">
      <div className="absolute inset-0 z-0 opacity-35 grayscale contrast-125">
        <Image
          src="https://images.unsplash.com/photo-1691922475317-5e2ce2bcd3c9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwaW5kdXN0cmlhbCUyMGJhc2VtZW50JTIwZ3J1bmdlJTIwdGV4dHVyZWQlMjBibGFjayUyMGFuZCUyMHdoaXRlfGVufDF8fHx8MTc3MTgyMDMxMHww&ixlib=rb-4.1.0&q=80&w=1080"
          alt="background"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
      </div>
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,transparent_10%,rgba(5,5,5,0.84)_72%)]" />

      <div className="absolute left-10 top-1/4 z-10 hidden md:block">
        <div className="max-w-xs rotate-[-5deg] border border-[#3a3a3a] bg-black/80 p-4">
          <p className="font-mono text-[10px] text-[#00ffd1] uppercase leading-relaxed">
            &quot;xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx&quot;
          </p>
          <div className="mt-2 text-right text-[8px] text-white">{'/// xxxxx_xx'}</div>
        </div>
      </div>

      <div className="absolute bottom-1/3 right-10 z-10 hidden md:block">
        <div className="rotate-[3deg] bg-[#00ffd1] p-1">
          <Image
            src="https://images.unsplash.com/photo-1653372512929-5ac36eb22a73?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzb2FwJTIwYmFyJTIwcGluayUyMG1pbmltYWxpc3R8ZW58MXx8fHwxNzcxODIwMzEwfDA&ixlib=rb-4.1.0&q=80&w=1080"
            alt="soap"
            width={128}
            height={128}
            sizes="128px"
            className="h-32 w-32 object-cover grayscale transition-all duration-300 hover:grayscale-0"
          />
          <div className="bg-black text-white text-[10px] font-mono p-1 text-center mt-1">
            99.44% 순도
          </div>
        </div>
      </div>

      <div className="relative z-20 w-full max-w-[100vw] px-4 text-center">
        <div className="mb-12 overflow-hidden border-y border-[#333] bg-black py-2">
          <div className="flex whitespace-nowrap gap-8 font-mono text-xs text-[#666]">
            {Array.from({ length: 12 }, (_, index) => (
              <span key={index}>enicoveck archive issue •</span>
            ))}
          </div>
        </div>

        <div className="relative inline-block group">
          <h1 className="relative z-20 select-none bg-gradient-to-b from-[#e5e5e5] to-[#666] bg-clip-text text-[18vw] font-heading font-black leading-[0.8] tracking-tighter text-transparent md:text-[15vw]">
            ENICO VECK
          </h1>
          <h1 className="pointer-events-none absolute left-0 top-0 z-10 text-[18vw] font-heading font-black leading-[0.8] tracking-tighter text-[#00ffd1] opacity-0 transition-all duration-150 group-hover:-translate-y-1 group-hover:translate-x-2 group-hover:opacity-25 md:text-[15vw]">
            ENICO VECK
          </h1>
          <h1 className="pointer-events-none absolute left-0 top-0 z-10 text-[18vw] font-heading font-black leading-[0.8] tracking-tighter text-[#00ffff] opacity-0 transition-all duration-150 group-hover:translate-y-1 group-hover:-translate-x-2 group-hover:opacity-20 md:text-[15vw]">
            ENICO VECK
          </h1>
        </div>

        <div className="mt-8 flex flex-col items-center gap-4">
          <div className="bg-[#00ffd1] text-black px-4 py-1 font-heading text-xl uppercase tracking-widest -rotate-2">
            경고: 고자극 콘텐츠
          </div>
          <p className="font-mono text-xs md:text-sm max-w-md text-[#888] leading-relaxed">
            반지하 원룸에서 옷만드는 괴짜 옷 보기
          </p>
        </div>

        <button
          type="button"
          onClick={handleEnterChaos}
          className="mt-12 group relative inline-flex items-center justify-center px-8 py-4 bg-transparent overflow-hidden border-2 border-[#e5e5e5] hover:border-[#00ffd1] transition-colors duration-300"
        >
          <div className="absolute inset-0 w-0 bg-[#00ffd1] transition-all duration-[250ms] ease-out group-hover:w-full opacity-100" />
          <span className="relative text-white group-hover:text-black font-mono font-bold tracking-widest text-sm z-10 flex items-center gap-2">
            ENTER HOPE <span className="group-hover:translate-x-2 transition-transform">→</span>
          </span>
        </button>

      </div>

      <div className="absolute bottom-10 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        <div className="w-[1px] h-20 bg-white animate-pulse" />
        <span className="font-mono text-[10px] uppercase tracking-widest">스크롤</span>
      </div>
    </section>
  );
}
