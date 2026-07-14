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
  const viewerRef = useRef<any>(null);

  useEffect(() => {
    // Dynamically import @google/model-viewer only on browser client to prevent Node.js SSR errors ('self is not defined')
    import('@google/model-viewer').catch(console.error);

    // Check loading state on model-viewer element
    const el = viewerRef.current;
    if (!el) return;

    const handleLoad = () => setIsLoaded(true);
    el.addEventListener('load', handleLoad);
    return () => {
      el.removeEventListener('load', handleLoad);
    };
  }, [modelUrl]);

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
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-white/60 backdrop-blur-sm border-b border-[#d1d5db]">
          <div className="flex items-center gap-2">
            <div className="flex h-2.5 w-2.5 rounded-full bg-[#b8001f] shadow-[0_0_6px_rgba(184,0,31,0.5)]" />
            <span className="font-mono text-[10px] tracking-widest text-[#b8001f] uppercase font-bold">
              3D VIEW
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

        {/* 3D Canvas */}
        <div
          className="relative flex-1 min-h-0"
          style={{ background: bgStyles[bgColor] }}
        >
          {!isLoaded && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/80 backdrop-blur-sm">
              <div className="h-8 w-8 animate-spin rounded-full border-3 border-[#b8001f] border-t-transparent" />
              <p className="font-mono text-xs text-[#b8001f] tracking-wider animate-pulse">
                3D 모델 로딩 중...
              </p>
            </div>
          )}

          <ModelViewerElement
            ref={viewerRef}
            src={modelUrl}
            alt={title}
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
            style={{
              width: '100%',
              height: '100%',
              '--poster-color': 'transparent',
              backgroundColor: 'transparent',
            } as React.CSSProperties}
          />

          {/* Bottom hint */}
          <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between rounded-lg border border-[#d1d5db] bg-white/80 px-3 py-1.5 backdrop-blur-sm">
            <span className="font-mono text-[10px] text-[#4b5563]">
              <span className="text-[#b8001f] font-bold">🖱️</span> 드래그 회전 · 휠 확대/축소
            </span>
            <span className="font-mono text-[10px] text-[#9ca3af]">ENICO VECK 3D</span>
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
            REAL-TIME 3D
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

      {/* 3D Canvas / Model Viewer Box */}
      <div
        className={`relative w-full h-[650px] md:h-[750px] transition-all duration-500 ${
          bgColor === 'transparent' ? 'bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2220%22%20height%3D%2220%22%3E%3Crect%20width%3D%2210%22%20height%3D%2210%22%20fill%3D%22%23222%22%2F%3E%3Crect%20x%3D%2210%22%20y%3D%2210%22%20width%3D%2210%22%20height%3D%2210%22%20fill%3D%22%23222%22%2F%3E%3Crect%20x%3D%2210%22%20width%3D%2210%22%20height%3D%2210%22%20fill%3D%22%23333%22%2F%3E%3Crect%20y%3D%2210%22%20width%3D%2210%22%20height%3D%2210%22%20fill%3D%22%23333%22%2F%3E%3C%2Fsvg%3E")]' : ''
        }`}
        style={bgColor !== 'transparent' ? { background: bgStyles[bgColor] } : undefined}
      >
        {!isLoaded && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-sm">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#00ffd1] border-t-transparent" />
            <p className="font-mono text-sm text-[#00ffd1] tracking-wider animate-pulse">
              3D 의상 시뮬레이션 데이터를 불러오는 중...
            </p>
          </div>
        )}

        <ModelViewerElement
          ref={viewerRef}
          src={modelUrl}
          alt={title}
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
          style={{
            width: '100%',
            height: '100%',
            '--poster-color': 'transparent',
            backgroundColor: 'transparent',
          } as React.CSSProperties}
        />

        {/* Bottom Helper Bar */}
        <div className="absolute bottom-4 left-6 right-6 flex items-center justify-between rounded-xl border border-white/10 bg-black/70 px-4 py-2.5 backdrop-blur-md">
          <div className="flex items-center gap-2 font-mono text-xs text-[#a0a0a0]">
            <span className="text-[#00ffd1]">🖱️ 마우스/터치:</span> 360° 드래그 회전 &amp; 휠 확대/축소
          </div>
          <div className="font-mono text-xs text-[#888888]">
            ENICO VECK 3D ENGINE
          </div>
        </div>
      </div>
    </div>
  );
}
