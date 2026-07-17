'use client';

import React, { useEffect, useState, useRef } from 'react';

// Use dynamic element cast to bypass TypeScript JSX intrinsic check across React 18/19 variations
const ModelViewerElement = 'model-viewer' as any;

interface Viewer3DProps {
  modelUrl: string;
  title?: string;
  fallbackImageUrl?: string;
  /** If true, renders with transparent background and minimal chrome for embedding */
  embedded?: boolean;
}

export function Viewer3D({
  modelUrl,
  title = '3D 의상 시뮬레이션 뷰어',
  fallbackImageUrl,
  embedded = false,
}: Viewer3DProps) {
  const [autoRotate, setAutoRotate] = useState(true);
  const [exposure, setExposure] = useState<number>(1.2);
  const [shadowIntensity, setShadowIntensity] = useState<number>(1.5);
  const [bgColor, setBgColor] = useState<'transparent' | 'dark' | 'void' | 'studio'>(
    embedded ? 'transparent' : 'dark',
  );
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [avatarSize, setAvatarSize] = useState<'s' | 'm' | 'l' | 'garment'>('m');
  const [activeSrc, setActiveSrc] = useState(modelUrl);
  const viewerRef = useRef<any>(null);
  const isSizeAdjustable = modelUrl.includes('bomber_jacket_avatar') || modelUrl === '/3d/bomber_jacket.glb';

  const getCloSetEmbedUrl = (url: string): string | null => {
    if (!url.includes('clo-set.com')) return null;
    if (url.includes('/viewer/embed/')) return url;
    const match = url.match(/(?:content|style|viewer)\/([a-zA-Z0-9_-]{32,})/);
    if (match && match[1]) {
      return `https://style.clo-set.com/viewer/embed/${match[1]}`;
    }
    return url;
  };
  const cloSetEmbedUrl = getCloSetEmbedUrl(activeSrc);

  const sizeSpecs = {
    s: {
      label: 'S (170cm·63kg)',
      desc: '작은 키 남성 골격 (슬림 피팅 3D 모델)',
      scale: '1 1 1',
      badge: 'SHORT',
    },
    m: {
      label: 'M (175cm·68kg)',
      desc: '중간 키 남성 표준 (정사이즈 3D 모델)',
      scale: '1 1 1',
      badge: 'STANDARD',
    },
    l: {
      label: 'L (182cm·75kg)',
      desc: '큰 키 남성 골격 (장신 피팅 3D 모델)',
      scale: '1 1 1',
      badge: 'TALL',
    },
    garment: {
      label: '의상만 보기',
      desc: '아바타 숨김 (가먼트 단독)',
      scale: '1 1 1',
      badge: 'ONLY',
    },
  };

  useEffect(() => {
    // 고객님께서 지정하신 modelUrl (예: /3d/film.glb)을 100% 그대로 유지하며 절대 봄버 자켓 파일로 교체하지 않습니다.
    setActiveSrc(modelUrl);
    setIsLoaded(false);
    setLoadError(false);
  }, [avatarSize, modelUrl]);

  useEffect(() => {
    // Dynamically import @google/model-viewer only on browser client to prevent Node.js SSR errors ('self is not defined')
    import('@google/model-viewer').catch(console.error);

    // Check loading state on model-viewer element
    const el = viewerRef.current;
    if (!el) return;

    if (el.loaded || el.modelIsVisible) {
      setIsLoaded(true);
      setLoadError(false);
    }

    const handleLoad = () => {
      setIsLoaded(true);
      setLoadError(false);
    };
    const handleError = () => {
      // 404 에러 등 로딩 실패 시 다른 봄버 자켓으로 우회/교체하지 않고 정직하게 에러 상태(대기 안내 UI) 표시
      setIsLoaded(true);
      setLoadError(true);
    };

    el.addEventListener('load', handleLoad);
    el.addEventListener('error', handleError);
    return () => {
      el.removeEventListener('load', handleLoad);
      el.removeEventListener('error', handleError);
    };
  }, [activeSrc, modelUrl]);

  const bgStyles: Record<typeof bgColor, string> = {
    transparent: 'transparent',
    dark: 'radial-gradient(circle at center, #1f1f1f 0%, #050505 100%)',
    void: 'radial-gradient(circle at center, #ffffff 0%, #dcdcdc 100%)',
    studio: 'linear-gradient(135deg, #18181b 0%, #09090b 100%)',
  };

  // Far zoom-out: camera starts at 4m distance, min 1m, max 12m
  const cameraOrbit = '0deg 75deg 4m';
  const minCameraOrbit = 'auto auto 1m';
  const maxCameraOrbit = 'auto auto 12m';

  if (embedded) {
    return (
      <div className="relative flex flex-col w-full h-full overflow-hidden">
        {/* Minimal toolbar for embedded mode */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-white/80 backdrop-blur-sm border-b border-[#d1d5db]">
          <div className="flex items-center gap-2">
            <div className="flex h-2.5 w-2.5 rounded-full bg-[#b8001f] shadow-[0_0_6px_rgba(184,0,31,0.5)]" />
            <span className="font-mono text-[10px] tracking-widest text-[#b8001f] uppercase font-bold">
              3D SIMULATION
            </span>
            <span className="rounded bg-[#f3f4f6] px-1.5 py-0.5 font-mono text-[10px] text-[#4b5563] font-semibold">
              {isSizeAdjustable ? sizeSpecs[avatarSize].badge : 'CLO 3D FILM'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[10px]">
            <button
              type="button"
              onClick={() => setAutoRotate(!autoRotate)}
              className={`px-2 py-1 rounded border transition ${
                autoRotate
                  ? 'border-[#b8001f]/30 bg-[#b8001f]/10 text-[#b8001f] font-bold'
                  : 'border-[#d1d5db] text-[#4b5563] hover:text-[#b8001f]'
              }`}
            >
              {autoRotate ? '⏸ 회전' : '▶ 회전'}
            </button>
            <button
              type="button"
              onClick={() => setExposure((prev) => (prev >= 2.0 ? 0.8 : prev + 0.3))}
              className="px-2 py-1 rounded border border-[#d1d5db] text-[#4b5563] hover:text-[#b8001f] transition"
            >
              💡 {exposure.toFixed(1)}x
            </button>
          </div>
        </div>

        {/* Body Spec & Avatar Selector Bar (오직 봄버 자켓 사이즈 가변 모델일 때만 노출) */}
        {isSizeAdjustable && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-[#f8f9fa] border-b border-[#d1d5db] font-mono text-xs">
            <div className="flex items-center gap-1.5 text-[#111827] font-semibold">
              <span className="text-[#b8001f] font-bold">🧑 체형 선택:</span>
              <span className="text-[#4b5563] text-[11px] hidden sm:inline">
                {sizeSpecs[avatarSize].desc}
              </span>
            </div>
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
              {(['s', 'm', 'l', 'garment'] as const).map((sizeKey) => {
                const spec = sizeSpecs[sizeKey];
                const isSelected = avatarSize === sizeKey;
                return (
                  <button
                    key={sizeKey}
                    type="button"
                    onClick={() => setAvatarSize(sizeKey)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-[8px] border text-[11px] whitespace-nowrap transition-all ${
                      isSelected
                        ? 'border-[#b8001f] bg-[#b8001f] text-white font-bold shadow-sm'
                        : 'border-[#d1d5db] bg-white text-[#4b5563] hover:border-[#b8001f] hover:text-[#b8001f]'
                    }`}
                  >
                    {sizeKey === 'garment' ? '🧥' : '🧑'} {spec.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 3D Canvas */}
        <div
          className="relative flex-1 min-h-0"
          style={{ background: bgStyles[bgColor] }}
        >
          {cloSetEmbedUrl ? (
            <iframe
              src={cloSetEmbedUrl}
              title={title}
              className="w-full h-full border-0 absolute inset-0 z-20"
              allowFullScreen
            />
          ) : (
            <>
              {!isLoaded && !loadError && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/80 backdrop-blur-sm">
                  <div className="h-8 w-8 animate-spin rounded-full border-3 border-[#b8001f] border-t-transparent" />
                  <p className="font-mono text-xs text-[#b8001f] tracking-wider animate-pulse">
                    {avatarSize === 'garment'
                      ? '의상 단독 3D 시뮬레이션 로딩 중...'
                      : `${sizeSpecs[avatarSize].label} 아바타 체형 피팅 로딩 중...`}
                  </p>
                </div>
              )}

              {loadError && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-white/95 p-6 text-center backdrop-blur-sm border border-[#d1d5db]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#fff1f2] border border-[#f87171] text-[#b8001f] text-2xl font-bold">
                    !
                  </div>
                  <p className="font-mono text-sm font-bold text-[#111827]">
                    [ CLO 3D 필름(film.zprj) 피팅 모델 대기 중 ]
                  </p>
                  <p className="font-mono text-xs text-[#4b5563] max-w-md leading-relaxed break-keep">
                    고객님께서 <strong className="text-[#b8001f]">필름.zprj</strong> 파일에 직접 입혀주신 아바타와 의상 피팅 데이터를 CLO 3D에서 <span className="underline font-bold">Export (GLB)</span>하여 <code className="bg-[#f3f4f6] px-1.5 py-0.5 rounded text-[#b8001f]">public/3d/film.glb</code>로 저장해주시면 즉시 3D창에 완벽히 로드됩니다.
                  </p>
                  <a
                    href="/3d/film.zprj"
                    download="film.zprj"
                    style={{ color: '#ffffff' }}
                    className="mt-3 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[#b8001f] text-white font-mono text-xs font-bold hover:bg-[#990019] transition-all shadow-md cursor-pointer"
                  >
                    <span>📦 원본 필름.zprj 다운로드 / CLO 3D에서 열기</span>
                  </a>
                </div>
              )}

              <ModelViewerElement
                ref={viewerRef}
                src={activeSrc}
                alt={`${title} - ${sizeSpecs[avatarSize].label}`}
                auto-rotate={autoRotate}
                camera-controls
                shadow-intensity={shadowIntensity}
                shadow-softness="1"
                exposure={exposure}
                rotation-per-second="25deg"
                camera-orbit={cameraOrbit}
                min-camera-orbit={minCameraOrbit}
                max-camera-orbit={maxCameraOrbit}
                environment-image="neutral"
                scale={sizeSpecs[avatarSize].scale}
                style={{
                  width: '100%',
                  height: '100%',
                  '--poster-color': 'transparent',
                  backgroundColor: 'transparent',
                } as React.CSSProperties}
              />
            </>
          )}

          {/* Bottom hint */}
          <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between rounded-lg border border-[#d1d5db] bg-white/80 px-3 py-1.5 backdrop-blur-sm">
            <span className="font-mono text-[10px] text-[#4b5563]">
              <span className="text-[#b8001f] font-bold">🖱️</span> 드래그 360° 회전 · 휠 확대/축소 (최대 12m)
            </span>
            <span className="font-mono text-[10px] text-[#b8001f] font-bold">
              {avatarSize === 'garment' ? 'GARMENT ONLY' : `AVATAR FITTING [${sizeSpecs[avatarSize].badge}]`}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Full standalone mode (for dedicated 3D pages)
  return (
    <div className="relative flex flex-col w-full overflow-hidden rounded-[24px] border border-white/15 bg-[#0a0a0a] shadow-2xl">
      {/* Top Header / Control Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#111111]/80 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-3 w-3 items-center justify-center rounded-full bg-[#00ffd1] shadow-[0_0_10px_#00ffd1]" />
          <h3 className="font-mono text-sm tracking-widest text-[#00ffd1] uppercase font-bold">
            {title}
          </h3>
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-[11px] text-[#cccccc]">
            REAL-TIME 3D · {sizeSpecs[avatarSize].badge}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          {/* Background Toggle */}
          <div className="flex items-center gap-1 rounded-lg bg-black/40 p-1 border border-white/10">
            <button
              type="button"
              onClick={() => setBgColor('transparent')}
              className={`px-2.5 py-1 rounded transition ${
                bgColor === 'transparent' ? 'bg-white/20 text-white font-bold ring-1 ring-white/30' : 'text-gray-400 hover:text-white'
              }`}
            >
              CLEAR
            </button>
            <button
              type="button"
              onClick={() => setBgColor('dark')}
              className={`px-2.5 py-1 rounded transition ${
                bgColor === 'dark' ? 'bg-[#00ffd1] text-black font-bold' : 'text-gray-400 hover:text-white'
              }`}
            >
              DARK
            </button>
            <button
              type="button"
              onClick={() => setBgColor('void')}
              className={`px-2.5 py-1 rounded transition ${
                bgColor === 'void' ? 'bg-white text-black font-bold' : 'text-gray-400 hover:text-white'
              }`}
            >
              VOID
            </button>
            <button
              type="button"
              onClick={() => setBgColor('studio')}
              className={`px-2.5 py-1 rounded transition ${
                bgColor === 'studio' ? 'bg-[#3b82f6] text-white font-bold' : 'text-gray-400 hover:text-white'
              }`}
            >
              STUDIO
            </button>
          </div>

          {/* Auto Rotate Toggle */}
          <button
            type="button"
            onClick={() => setAutoRotate(!autoRotate)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition ${
              autoRotate
                ? 'border-[#00ffd1]/40 bg-[#00ffd1]/10 text-[#00ffd1]'
                : 'border-white/10 bg-black/40 text-gray-400 hover:text-white'
            }`}
          >
            <span>{autoRotate ? '⏸ 자동 회전 켜짐' : '▶ 자동 회전 켜기'}</span>
          </button>

          {/* Exposure Control */}
          <button
            type="button"
            onClick={() => setExposure((prev) => (prev >= 2.0 ? 0.8 : prev + 0.3))}
            className="px-3 py-1.5 rounded-lg border border-white/10 bg-black/40 text-gray-300 hover:text-white transition"
          >
            💡 조명: {exposure.toFixed(1)}x
          </button>
        </div>
      </div>

      {/* Body Spec Selector Bar for Standalone Mode (오직 봄버 자켓 사이즈 가변 모델일 때만 노출) */}
      {isSizeAdjustable && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 bg-[#18181b] border-b border-white/10 font-mono text-xs">
          <div className="flex items-center gap-2 text-white font-semibold">
            <span className="text-[#00ffd1] font-bold">🧑 아바타 체형 선택:</span>
            <span className="text-gray-400 text-[11px]">
              {sizeSpecs[avatarSize].desc}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {(['s', 'm', 'l', 'garment'] as const).map((sizeKey) => {
              const spec = sizeSpecs[sizeKey];
              const isSelected = avatarSize === sizeKey;
              return (
                <button
                  key={sizeKey}
                  type="button"
                  onClick={() => setAvatarSize(sizeKey)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-all ${
                    isSelected
                      ? 'border-[#00ffd1] bg-[#00ffd1] text-black font-bold shadow-[0_0_10px_rgba(0,255,209,0.3)]'
                      : 'border-white/15 bg-black/40 text-gray-300 hover:border-[#00ffd1] hover:text-[#00ffd1]'
                  }`}
                >
                  {sizeKey === 'garment' ? '🧥' : '🧑'} {spec.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 3D Canvas / Model Viewer Box */}
      <div
        className="relative w-full h-[650px] md:h-[750px] transition-all duration-500"
        style={bgColor !== 'transparent' ? { background: bgStyles[bgColor] } : undefined}
      >
        {cloSetEmbedUrl ? (
          <iframe
            src={cloSetEmbedUrl}
            title={title}
            className="w-full h-full border-0 absolute inset-0 z-20"
            allowFullScreen
          />
        ) : (
          <>
            {!isLoaded && !loadError && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-sm">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#00ffd1] border-t-transparent" />
                <p className="font-mono text-sm text-[#00ffd1] tracking-wider animate-pulse">
                  {avatarSize === 'garment'
                    ? '의상 단독 3D 시뮬레이션 로딩 중...'
                    : `${sizeSpecs[avatarSize].label} 아바타 체형 피팅 로딩 중...`}
                </p>
              </div>
            )}

            {loadError && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-[#111111]/95 p-8 text-center backdrop-blur-md border border-white/10">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#00ffd1]/10 border border-[#00ffd1] text-[#00ffd1] text-3xl font-bold shadow-[0_0_15px_rgba(0,255,209,0.3)]">
                  !
                </div>
                <p className="font-mono text-base font-bold text-white tracking-wide">
                  [ CLO 3D 필름(film.zprj) 피팅 모델 대기 중 ]
                </p>
                <p className="font-mono text-xs text-gray-300 max-w-lg leading-relaxed break-keep">
                  고객님께서 <strong className="text-[#00ffd1]">필름.zprj</strong> 파일에 직접 입혀주신 아바타와 의상 피팅 데이터를 CLO 3D에서 <span className="underline font-bold text-white">Export (GLB)</span>하여 <code className="bg-black/50 border border-white/15 px-2 py-0.5 rounded text-[#00ffd1]">public/3d/film.glb</code>로 저장해주시면 즉시 3D창에 완벽히 로드됩니다.
                </p>
                <a
                  href="/3d/film.zprj"
                  download="film.zprj"
                  className="mt-2 inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-[#00ffd1] text-black font-mono text-xs font-black hover:bg-white transition-colors shadow-[0_0_15px_rgba(0,255,209,0.4)]"
                >
                  <span>📦 원본 필름.zprj 파일 다운로드 / CLO 3D에서 열기</span>
                </a>
              </div>
            )}

            <ModelViewerElement
              ref={viewerRef}
              src={activeSrc}
              alt={`${title} - ${sizeSpecs[avatarSize].label}`}
              auto-rotate={autoRotate}
              camera-controls
              shadow-intensity={shadowIntensity}
              shadow-softness="1"
              exposure={exposure}
              rotation-per-second="25deg"
              camera-orbit={cameraOrbit}
              min-camera-orbit={minCameraOrbit}
              max-camera-orbit={maxCameraOrbit}
              environment-image="neutral"
              scale={sizeSpecs[avatarSize].scale}
              style={{
                width: '100%',
                height: '100%',
                '--poster-color': 'transparent',
                backgroundColor: 'transparent',
              } as React.CSSProperties}
            />
          </>
        )}

        {/* Bottom Helper Bar */}
        <div className="absolute bottom-4 left-6 right-6 flex items-center justify-between rounded-xl border border-white/10 bg-black/70 px-4 py-2.5 backdrop-blur-md">
          <div className="flex items-center gap-2 font-mono text-xs text-[#a0a0a0]">
            <span className="text-[#00ffd1]">🖱️ 마우스/터치:</span> 360° 드래그 회전 &amp; 휠 확대/축소 (최대 12m)
          </div>
          <div className="font-mono text-xs text-[#888888]">
            ENICO VECK 3D ENGINE · {avatarSize === 'garment' ? 'GARMENT ONLY' : `AVATAR FITTING [${sizeSpecs[avatarSize].badge}]`}
          </div>
        </div>
      </div>
    </div>
  );
}
