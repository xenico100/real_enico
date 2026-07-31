'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowLeft, Layers, Lock, Sparkles } from 'lucide-react';
import { useAuth } from '@/app/context/AuthContext';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

const Viewer3D = dynamic(() => import('@/components/common/Viewer3D').then((module) => module.Viewer3D), {
  ssr: false,
});

const PRIMARY_ADMIN_EMAIL = 'morba9850@gmail.com';
const BOMBER_MODEL_URL = '/3d/bomber_jacket.glb';
const FILM_MODEL_URL = process.env.NEXT_PUBLIC_FILM_3D_URL?.trim() || '';

export default function Test3DPage() {
  const { isConfigured, isAuthReady, isAuthenticated, user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(true);
  const [selectedModel, setSelectedModel] = useState(FILM_MODEL_URL || BOMBER_MODEL_URL);

  useEffect(() => {
    let active = true;

    const finish = (allowed: boolean) => {
      if (!active) return;
      setIsAdmin(allowed);
      setIsCheckingAdmin(false);
    };

    const checkAdmin = async () => {
      if (!isAuthReady) return;
      if (!isConfigured || !isAuthenticated || !user) {
        finish(false);
        return;
      }

      if ((user.email || '').trim().toLowerCase() === PRIMARY_ADMIN_EMAIL) {
        finish(true);
        return;
      }

      try {
        const supabase = getSupabaseBrowserClient();
        if (!supabase) {
          finish(false);
          return;
        }

        const { data, error } = await supabase
          .from('admins')
          .select('user_id')
          .eq('user_id', user.id)
          .maybeSingle();

        finish(!error && Boolean(data?.user_id));
      } catch {
        finish(false);
      }
    };

    void checkAdmin();
    return () => {
      active = false;
    };
  }, [isConfigured, isAuthReady, isAuthenticated, user]);

  if (!isAuthReady || isCheckingAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#050505] text-white">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#00ffd1] border-t-transparent motion-reduce:animate-none" />
        <p className="mt-4 font-mono text-sm text-gray-400" role="status">
          관리자 권한 확인 중...
        </p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#050505] px-4 text-center text-white">
        <div className="flex h-20 w-20 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 text-red-500 shadow-[0_0_30px_rgba(239,68,68,0.2)]">
          <Lock className="h-10 w-10" aria-hidden="true" />
        </div>
        <h1 className="mt-6 font-heading text-4xl uppercase tracking-tight md:text-5xl">
          Admin Access Only
        </h1>
        <p className="mt-3 max-w-md font-mono text-sm leading-relaxed text-[#a0a0a0]">
          이 페이지는 로그인한 관리자만 사용할 수 있는 3D 모델 검수 화면입니다.
        </p>
        <Link
          href="/"
          className="mt-8 flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-6 py-3 font-mono text-sm text-white transition hover:bg-white/15"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          메인 홈페이지로 돌아가기
        </Link>
      </div>
    );
  }

  const isFilmSelected = Boolean(FILM_MODEL_URL) && selectedModel === FILM_MODEL_URL;

  return (
    <main className="min-h-screen bg-[#050505] py-8 text-white md:py-14">
      <div className="mx-auto max-w-[1400px] px-4 md:px-8">
        <header className="mb-8 flex flex-col justify-between gap-6 border-b border-white/10 pb-6 md:flex-row md:items-end">
          <div>
            <div className="flex items-center gap-2 font-mono text-xs text-[#00ffd1]">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>TEST POST · ADMIN ONLY</span>
            </div>
            <h1 className="mt-2 font-heading text-4xl uppercase tracking-tight md:text-6xl">
              3D MODEL <span className="text-white/40">REVIEW</span>
            </h1>
            <p className="mt-2 font-mono text-sm text-[#b0b0b0]">
              배포된 GLB 또는 허용된 CLO-SET 모델을 검수하는 관리자용 화면입니다.
            </p>
          </div>

          <Link
            href="/"
            className="flex items-center gap-2 self-start rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 font-mono text-xs text-gray-300 transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            홈으로 이동
          </Link>
        </header>

        <div className="mb-6 flex flex-wrap items-center gap-3 font-mono text-xs" aria-label="검수 모델 선택">
          <span className="text-gray-400">모델 선택:</span>
          {FILM_MODEL_URL ? (
            <button
              type="button"
              onClick={() => setSelectedModel(FILM_MODEL_URL)}
              aria-pressed={isFilmSelected}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 transition ${
                isFilmSelected
                  ? 'border-[#00ffd1] bg-[#00ffd1]/10 font-bold text-[#00ffd1] shadow-[0_0_15px_rgba(0,255,209,0.2)]'
                  : 'border-white/10 bg-[#111] text-gray-400 hover:text-white'
              }`}
            >
              <Layers className="h-4 w-4" aria-hidden="true" />
              Cinema Film CDN 모델
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setSelectedModel(BOMBER_MODEL_URL)}
            aria-pressed={!isFilmSelected}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 transition ${
              !isFilmSelected
                ? 'border-[#00ffd1] bg-[#00ffd1]/10 font-bold text-[#00ffd1] shadow-[0_0_15px_rgba(0,255,209,0.2)]'
                : 'border-white/10 bg-[#111] text-gray-400 hover:text-white'
            }`}
          >
            <Layers className="h-4 w-4" aria-hidden="true" />
            CLO 샘플 봄버 자켓
          </button>
        </div>

        {!FILM_MODEL_URL ? (
          <p className="mb-6 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 font-mono text-xs text-amber-100">
            Film 모델은 <code>NEXT_PUBLIC_FILM_3D_URL</code>에 배포된 HTTPS URL을 설정한 뒤 표시됩니다. 로컬 원본 자산은 자동으로 공개하지 않습니다.
          </p>
        ) : null}

        <Viewer3D
          modelUrl={selectedModel}
          title={isFilmSelected ? 'Cinema Film 3D Model' : 'CLO Bomber Jacket Sample'}
        />

        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
          <section className="rounded-2xl border border-white/10 bg-[#0d0d0d] p-6">
            <h2 className="font-mono text-sm font-bold uppercase text-[#00ffd1]">1. 모델 검수</h2>
            <p className="mt-2 font-mono text-xs leading-relaxed text-gray-400">
              회전과 확대를 사용해 실루엣, 텍스처와 카메라 framing을 확인합니다.
            </p>
          </section>
          <section className="rounded-2xl border border-white/10 bg-[#0d0d0d] p-6">
            <h2 className="font-mono text-sm font-bold uppercase text-[#00ffd1]">2. 관리자 권한</h2>
            <p className="mt-2 font-mono text-xs leading-relaxed text-gray-400">
              브라우저의 임의 플래그가 아니라 로그인 세션과 admins 레코드로 화면 접근을 판정합니다.
            </p>
          </section>
          <section className="rounded-2xl border border-white/10 bg-[#0d0d0d] p-6">
            <h2 className="font-mono text-sm font-bold uppercase text-[#00ffd1]">3. 자산 배포</h2>
            <p className="mt-2 font-mono text-xs leading-relaxed text-gray-400">
              대용량 GLB는 최적화 후 CDN에 배포하고 상품의 명시적인 modelUrl로 연결합니다.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
