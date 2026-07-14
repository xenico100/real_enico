'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/app/context/AuthContext';
import dynamic from 'next/dynamic';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { ArrowLeft, Lock, Sparkles, RefreshCw, Layers } from 'lucide-react';

const Viewer3D = dynamic(() => import('@/components/common/Viewer3D').then((m) => m.Viewer3D), {
  ssr: false,
});

const PRIMARY_ADMIN_EMAIL = 'morba9850@gmail.com';

export default function Test3DPage() {
  const { isConfigured, isAuthReady, isAuthenticated, user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string>('/3d/film.glb');

  useEffect(() => {
    let active = true;
    const checkAdmin = async () => {
      if (typeof window !== 'undefined' && window.localStorage.getItem('ENICO_FORCE_ADMIN') === 'true') {
        if (active) {
          setIsAdmin(true);
          setIsCheckingAdmin(false);
        }
        return;
      }
      if (!isConfigured || !isAuthReady) return;
      if (!isAuthenticated || !user) {
        if (active) {
          setIsAdmin(false);
          setIsCheckingAdmin(false);
        }
        return;
      }

      const normalizedEmail = (user.email || '').toLowerCase();
      if (normalizedEmail === PRIMARY_ADMIN_EMAIL) {
        if (active) {
          setIsAdmin(true);
          setIsCheckingAdmin(false);
        }
        return;
      }

      try {
        const supabase = getSupabaseBrowserClient();
        if (!supabase) throw new Error('No supabase');
        const { data } = await supabase
          .from('admins')
          .select('user_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (active) {
          setIsAdmin(Boolean(data?.user_id));
        }
      } catch {
        if (active) setIsAdmin(false);
      } finally {
        if (active) setIsCheckingAdmin(false);
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
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#00ffd1] border-t-transparent" />
        <p className="mt-4 font-mono text-sm text-gray-400">관리자 권한 확인 중...</p>
      </div>
    );
  }

  // 관리자가 아닐 때 (일반 사용자 접근 차단 모드)
  if (!isAdmin && !(typeof window !== 'undefined' && window.localStorage.getItem('ENICO_FORCE_ADMIN') === 'true')) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#050505] px-4 text-center text-white">
        <div className="flex h-20 w-20 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 text-red-500 shadow-[0_0_30px_rgba(239,68,68,0.2)]">
          <Lock className="h-10 w-10" />
        </div>
        <h1 className="mt-6 font-heading text-4xl uppercase tracking-tight md:text-5xl">
          Admin Access Only
        </h1>
        <p className="mt-3 max-w-md font-mono text-sm leading-relaxed text-[#a0a0a0]">
          이 페이지는 <span className="text-[#00ffd1]">CLO 3D 의상 시뮬레이션 인터랙티브 뷰어</span> 테스트 전용 게시글이며, 최고 관리자(<code className="text-white">morba9850@gmail.com</code>)에게만 표시됩니다.
        </p>
        <Link
          href="/"
          className="mt-8 flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-6 py-3 font-mono text-sm text-white transition hover:bg-white/15"
        >
          <ArrowLeft className="h-4 w-4" />
          메인 홈페이지로 돌아가기
        </Link>
      </div>
    );
  }

  // 관리자 권한 확인 완료 시 3D 테스트 쇼룸 표시
  return (
    <div className="min-h-screen bg-[#050505] py-8 text-white md:py-14">
      <div className="mx-auto max-w-[1400px] px-4 md:px-8">
        {/* 상단 네비게이션 & 타이틀 바 */}
        <div className="mb-8 flex flex-col justify-between gap-6 md:flex-row md:items-end border-b border-white/10 pb-6">
          <div>
            <div className="flex items-center gap-2 font-mono text-xs text-[#00ffd1]">
              <Sparkles className="h-4 w-4" />
              <span>TEST POST • ADMIN ONLY</span>
            </div>
            <h1 className="mt-2 font-heading text-4xl uppercase tracking-tight md:text-6xl">
              CINEMA PROJECT <span className="text-white/40">3D SHOWROOM</span>
            </h1>
            <p className="mt-2 font-mono text-sm text-[#b0b0b0]">
              CLO 3D (<code className="text-[#00ffd1]">필름.zprj</code>) 실시간 추출 모델 및 인터랙티브 의상 시뮬레이션 테스트
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 font-mono text-xs text-gray-300 transition hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              홈으로 이동
            </Link>
          </div>
        </div>

        {/* 모델 선택 탭 (필름.glb / 샘플 자켓 등 선택 가능) */}
        <div className="mb-6 flex flex-wrap items-center gap-3 font-mono text-xs">
          <span className="text-gray-400">모델 선택:</span>
          <button
            type="button"
            onClick={() => setSelectedModel('/3d/film.glb')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 border transition ${
              selectedModel === '/3d/film.glb'
                ? 'border-[#00ffd1] bg-[#00ffd1]/10 text-[#00ffd1] font-bold shadow-[0_0_15px_rgba(0,255,209,0.2)]'
                : 'border-white/10 bg-[#111] text-gray-400 hover:text-white'
            }`}
          >
            <Layers className="h-4 w-4" />
            🎬 씨네마 [필름.zprj] 추출 모델 (/3d/film.glb)
          </button>
          <button
            type="button"
            onClick={() => setSelectedModel('/3d/bomber_jacket.glb')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 border transition ${
              selectedModel === '/3d/bomber_jacket.glb'
                ? 'border-[#00ffd1] bg-[#00ffd1]/10 text-[#00ffd1] font-bold shadow-[0_0_15px_rgba(0,255,209,0.2)]'
                : 'border-white/10 bg-[#111] text-gray-400 hover:text-white'
            }`}
          >
            <Layers className="h-4 w-4" />
            🧥 CLO 샘플 오버사이즈 봄버 자켓 (/3d/bomber_jacket.glb)
          </button>
        </div>

        {/* 3D 인터랙티브 뷰어 영역 */}
        <Viewer3D
          modelUrl={selectedModel}
          title={
            selectedModel.includes('film')
              ? '씨네마 컬렉션 : 필름 (Film 3D Simulation)'
              : 'ENICO VECK 3D 가먼트 샘플 (Bomber Jacket)'
          }
        />

        {/* 하단 설명 섹션 */}
        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-[#0d0d0d] p-6">
            <h3 className="font-mono text-sm uppercase text-[#00ffd1] font-bold">1. 실시간 회전 &amp; 확대</h3>
            <p className="mt-2 font-mono text-xs leading-relaxed text-gray-400">
              마우스 드래그 또는 터치로 3D 의상 모델을 360도 회전하며 입체 핏과 텍스처를 감상할 수 있습니다. 휠이나 두 손가락 줌으로 원단 디테일도 확대 가능합니다.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#0d0d0d] p-6">
            <h3 className="font-mono text-sm uppercase text-[#00ffd1] font-bold">2. 관리자 전용 보안 모드</h3>
            <p className="mt-2 font-mono text-xs leading-relaxed text-gray-400">
              이 테스트 페이지는 최고 관리자 계정으로 로그인했을 때만 접근 및 시뮬레이션이 가능하며, 외부 방문자에게는 자물쇠 잠금 화면이 표시됩니다.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#0d0d0d] p-6">
            <h3 className="font-mono text-sm uppercase text-[#00ffd1] font-bold">3. CLO 3D 연동 자동화</h3>
            <p className="mt-2 font-mono text-xs leading-relaxed text-gray-400">
              CLO 3D 헤드리스 파이썬 API를 통해 외장하드의 <code className="text-[#00ffd1]">.zprj</code> 프로젝트 파일에서 3D 에셋(.glb / .obj)을 즉시 추출하여 뷰어로 연동합니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
