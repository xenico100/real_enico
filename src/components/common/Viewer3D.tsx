'use client';

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

export type Viewer3DVariantKey = 'm_168' | 'm_182' | 'f_std' | 'f_tall' | 'garment';
export type Viewer3DVariants = Partial<Record<Viewer3DVariantKey, string>>;

type ModelViewerDomElement = HTMLElement & {
  loaded?: boolean;
  modelIsVisible?: boolean;
};

type ModelViewerProps = React.HTMLAttributes<HTMLElement> & {
  ref?: React.Ref<ModelViewerDomElement>;
  src: string;
  alt: string;
  poster?: string;
  loading?: 'auto' | 'lazy' | 'eager';
  reveal?: 'auto' | 'interaction' | 'manual';
  'auto-rotate'?: boolean;
  'camera-controls'?: boolean;
  'shadow-intensity'?: number;
  'shadow-softness'?: string;
  exposure?: number;
  'rotation-per-second'?: string;
  'camera-orbit'?: string;
  'min-camera-orbit'?: string;
  'max-camera-orbit'?: string;
  bounds?: 'legacy' | 'tight';
  'camera-target'?: string;
  'environment-image'?: string;
  scale?: string;
};

// The runtime value remains the custom-element tag while TypeScript receives its supported props.
const ModelViewerElement = 'model-viewer' as unknown as React.ComponentType<ModelViewerProps>;

interface Viewer3DProps {
  modelUrl: string;
  title?: string;
  fallbackImageUrl?: string;
  variants?: Viewer3DVariants;
  /** If true, renders with transparent background and minimal chrome for embedding. */
  embedded?: boolean;
}

type LoadState = {
  src: string;
  status: 'loaded' | 'error';
};

const VARIANT_ORDER: Viewer3DVariantKey[] = [
  'm_168',
  'm_182',
  'f_std',
  'f_tall',
  'garment',
];

const SIZE_SPECS: Record<
  Viewer3DVariantKey,
  { label: string; desc: string; badge: string; icon: string }
> = {
  m_168: {
    label: '남성 (168cm · 60kg)',
    desc: '남성 슬림 아바타 피팅 3D 모델',
    badge: 'MEN 168',
    icon: '남',
  },
  m_182: {
    label: '남성 (182cm · 72kg)',
    desc: '남성 장신 아바타 피팅 3D 모델',
    badge: 'MEN 182',
    icon: '남',
  },
  f_std: {
    label: '여성 표준 (165cm · 52kg)',
    desc: '여성 표준 아바타 피팅 3D 모델',
    badge: 'WOMEN STD',
    icon: '여',
  },
  f_tall: {
    label: '여성 장신 (172cm · 56kg)',
    desc: '여성 장신 아바타 피팅 3D 모델',
    badge: 'WOMEN TALL',
    icon: '여',
  },
  garment: {
    label: '의상만 보기',
    desc: '아바타를 제외한 의상 단독 3D 모델',
    badge: 'GARMENT',
    icon: '옷',
  },
};

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(callback: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
  mediaQuery.addEventListener('change', callback);
  return () => mediaQuery.removeEventListener('change', callback);
}

function getReducedMotionSnapshot() {
  return typeof window !== 'undefined' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getServerReducedMotionSnapshot() {
  return false;
}

function normalizeModelSource(value: string | undefined) {
  const source = value?.trim() || '';
  if (!source) return null;

  if (source.startsWith('/')) {
    return source.startsWith('/3d/') ? source : null;
  }

  try {
    const parsed = new URL(source);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function getCloSetEmbedUrl(value: string | null) {
  if (!value || value.startsWith('/')) return null;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'style.clo-set.com') {
      return null;
    }

    const embedMatch = parsed.pathname.match(/^\/viewer\/embed\/([A-Za-z0-9_-]{32,})\/?$/);
    if (embedMatch?.[1]) {
      return `https://style.clo-set.com/viewer/embed/${embedMatch[1]}`;
    }

    const contentMatch = parsed.pathname.match(
      /^\/(?:content|style|viewer)\/([A-Za-z0-9_-]{32,})\/?$/,
    );
    return contentMatch?.[1]
      ? `https://style.clo-set.com/viewer/embed/${contentMatch[1]}`
      : null;
  } catch {
    return null;
  }
}

export function Viewer3D({
  modelUrl,
  title = '3D 의상 시뮬레이션 뷰어',
  fallbackImageUrl,
  variants,
  embedded = false,
}: Viewer3DProps) {
  const prefersReducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getServerReducedMotionSnapshot,
  );
  const [autoRotate, setAutoRotate] = useState(true);
  const [exposure, setExposure] = useState(1.2);
  const [bgColor, setBgColor] = useState<'transparent' | 'dark' | 'void' | 'studio'>(
    embedded ? 'transparent' : 'dark',
  );
  const [selectedVariant, setSelectedVariant] = useState<Viewer3DVariantKey | null>(null);
  const [loadState, setLoadState] = useState<LoadState | null>(null);
  const viewerRef = useRef<ModelViewerDomElement>(null);

  const baseSrc = normalizeModelSource(modelUrl);
  const availableVariantKeys = useMemo(
    () => VARIANT_ORDER.filter((key) => Boolean(normalizeModelSource(variants?.[key]))),
    [variants],
  );
  const variantSrc = selectedVariant ? normalizeModelSource(variants?.[selectedVariant]) : null;
  const activeSrc = variantSrc || baseSrc;
  const activeSpec = selectedVariant ? SIZE_SPECS[selectedVariant] : null;
  const cloSetEmbedUrl = getCloSetEmbedUrl(activeSrc);
  const isLoaded = Boolean(activeSrc && loadState?.src === activeSrc && loadState.status === 'loaded');
  const loadError = !activeSrc || loadState?.src === activeSrc && loadState.status === 'error';
  const effectiveAutoRotate = autoRotate && !prefersReducedMotion;

  useEffect(() => {
    void import('@google/model-viewer').catch((error) => {
      console.error('Failed to initialize model-viewer', error);
    });
  }, []);

  useEffect(() => {
    const element = viewerRef.current;
    if (!element || !activeSrc || cloSetEmbedUrl) return;

    const handleLoad = () => setLoadState({ src: activeSrc, status: 'loaded' });
    const handleError = () => setLoadState({ src: activeSrc, status: 'error' });

    element.addEventListener('load', handleLoad);
    element.addEventListener('error', handleError);

    if (element.loaded || element.modelIsVisible) {
      queueMicrotask(handleLoad);
    }

    return () => {
      element.removeEventListener('load', handleLoad);
      element.removeEventListener('error', handleError);
    };
  }, [activeSrc, cloSetEmbedUrl]);

  const bgStyles: Record<typeof bgColor, string> = {
    transparent: 'transparent',
    dark: 'radial-gradient(circle at center, #1f1f1f 0%, #050505 100%)',
    void: 'radial-gradient(circle at center, #ffffff 0%, #dcdcdc 100%)',
    studio: 'linear-gradient(135deg, #18181b 0%, #09090b 100%)',
  };

  const accent = embedded ? '#b8001f' : '#00ffd1';
  const toolbarClass = embedded
    ? 'border-b border-[#d1d5db] bg-white/90 text-[#111827]'
    : 'border-b border-white/10 bg-[#111111]/90 text-white';
  const mutedTextClass = embedded ? 'text-[#4b5563]' : 'text-[#a0a0a0]';

  return (
    <section
      className={`relative flex w-full flex-col overflow-hidden ${
        embedded
          ? 'h-full bg-white'
          : 'rounded-[24px] border border-white/15 bg-[#0a0a0a] shadow-2xl'
      }`}
      aria-label={title}
    >
      <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${toolbarClass}`}>
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: accent, boxShadow: `0 0 8px ${accent}` }}
          />
          <h3 className="truncate font-mono text-xs font-bold uppercase tracking-widest">
            {title}
          </h3>
          <span className={`hidden font-mono text-[10px] font-bold sm:inline ${mutedTextClass}`}>
            {activeSpec?.badge || '3D MODEL'}
          </span>
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px]">
          {!embedded ? (
            <div className="hidden items-center gap-1 lg:flex" aria-label="3D 배경 선택">
              {(['transparent', 'dark', 'void', 'studio'] as const).map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setBgColor(color)}
                  aria-pressed={bgColor === color}
                  className={`rounded border px-2 py-1 uppercase transition-colors ${
                    bgColor === color
                      ? 'border-[#00ffd1] bg-[#00ffd1] text-black'
                      : 'border-white/15 text-gray-300 hover:border-[#00ffd1] hover:text-[#00ffd1]'
                  }`}
                >
                  {color}
                </button>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setAutoRotate((current) => !current)}
            aria-pressed={effectiveAutoRotate}
            title={prefersReducedMotion ? '시스템의 동작 줄이기 설정으로 자동 회전이 중지되었습니다.' : undefined}
            className={`rounded border px-2.5 py-1.5 font-bold transition-colors ${
              effectiveAutoRotate
                ? embedded
                  ? 'border-[#b8001f] bg-[#fff1f2] text-[#b8001f]'
                  : 'border-[#00ffd1] bg-[#00ffd1]/10 text-[#00ffd1]'
                : embedded
                  ? 'border-[#d1d5db] text-[#4b5563]'
                  : 'border-white/15 text-gray-300'
            }`}
          >
            {effectiveAutoRotate ? '회전 중지' : '자동 회전'}
          </button>
          <button
            type="button"
            onClick={() => setExposure((current) => current >= 2 ? 0.8 : current + 0.3)}
            aria-label={`조명 밝기 ${exposure.toFixed(1)}배. 누르면 다음 밝기로 변경`}
            className={`rounded border px-2.5 py-1.5 transition-colors ${
              embedded
                ? 'border-[#d1d5db] text-[#4b5563] hover:border-[#b8001f] hover:text-[#b8001f]'
                : 'border-white/15 text-gray-300 hover:border-[#00ffd1] hover:text-[#00ffd1]'
            }`}
          >
            조명 {exposure.toFixed(1)}x
          </button>
        </div>
      </div>

      {availableVariantKeys.length > 0 ? (
        <div
          className={`flex flex-wrap items-center gap-2 border-b px-4 py-2.5 font-mono text-xs ${
            embedded
              ? 'border-[#d1d5db] bg-[#f8f9fa]'
              : 'border-white/10 bg-[#18181b] text-white'
          }`}
          aria-label="아바타 체형 선택"
        >
          <span className={embedded ? 'font-bold text-[#b8001f]' : 'font-bold text-[#00ffd1]'}>
            체형 선택
          </span>
          <button
            type="button"
            onClick={() => setSelectedVariant(null)}
            aria-pressed={selectedVariant === null}
            className={`rounded-lg border px-3 py-1.5 transition-colors ${
              selectedVariant === null
                ? embedded
                  ? 'border-[#b8001f] bg-[#b8001f] text-white'
                  : 'border-[#00ffd1] bg-[#00ffd1] font-bold text-black'
                : embedded
                  ? 'border-[#d1d5db] bg-white text-[#4b5563]'
                  : 'border-white/15 text-gray-300'
            }`}
          >
            기본 모델
          </button>
          {availableVariantKeys.map((key) => {
            const spec = SIZE_SPECS[key];
            const selected = selectedVariant === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedVariant(key)}
                aria-pressed={selected}
                title={spec.desc}
                className={`rounded-lg border px-3 py-1.5 transition-colors ${
                  selected
                    ? embedded
                      ? 'border-[#b8001f] bg-[#b8001f] font-bold text-white'
                      : 'border-[#00ffd1] bg-[#00ffd1] font-bold text-black'
                    : embedded
                      ? 'border-[#d1d5db] bg-white text-[#4b5563] hover:border-[#b8001f]'
                      : 'border-white/15 text-gray-300 hover:border-[#00ffd1]'
                }`}
              >
                <span aria-hidden="true" className="mr-1">{spec.icon}</span>
                {spec.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div
        className={`relative w-full ${embedded ? 'min-h-[400px] flex-1' : 'h-[650px] md:h-[750px]'}`}
        style={{ background: bgStyles[bgColor] }}
      >
        {cloSetEmbedUrl ? (
          <iframe
            src={cloSetEmbedUrl}
            title={title}
            className="absolute inset-0 h-full w-full border-0"
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock"
            allow="fullscreen"
            allowFullScreen
          />
        ) : activeSrc ? (
          <>
            {!isLoaded && !loadError ? (
              <div
                className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 ${
                  embedded ? 'bg-white/85' : 'bg-black/65'
                } backdrop-blur-sm`}
                role="status"
                aria-live="polite"
              >
                <div
                  className={`h-9 w-9 animate-spin rounded-full border-4 border-t-transparent motion-reduce:animate-none ${
                    embedded ? 'border-[#b8001f]' : 'border-[#00ffd1]'
                  }`}
                />
                <p className={`font-mono text-xs font-bold ${embedded ? 'text-[#b8001f]' : 'text-[#00ffd1]'}`}>
                  3D 모델을 불러오는 중입니다.
                </p>
              </div>
            ) : null}

            {loadError ? (
              <div
                className={`absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 p-6 text-center ${
                  embedded ? 'bg-white/95 text-[#111827]' : 'bg-[#111111]/95 text-white'
                }`}
                role="alert"
              >
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-full border text-2xl font-bold ${
                    embedded
                      ? 'border-[#f87171] bg-[#fff1f2] text-[#b8001f]'
                      : 'border-[#00ffd1] bg-[#00ffd1]/10 text-[#00ffd1]'
                  }`}
                >
                  !
                </span>
                <p className="font-mono text-sm font-bold">3D 모델을 불러오지 못했습니다.</p>
                <p className={`max-w-md font-mono text-xs leading-relaxed ${mutedTextClass}`}>
                  모델 URL과 배포 상태를 확인하거나 잠시 후 다시 시도해 주세요.
                </p>
              </div>
            ) : null}

            <ModelViewerElement
              key={activeSrc}
              ref={viewerRef}
              src={activeSrc}
              alt={`${title}${activeSpec ? ` - ${activeSpec.label}` : ''}`}
              poster={fallbackImageUrl}
              loading="lazy"
              reveal="auto"
              auto-rotate={effectiveAutoRotate}
              camera-controls
              shadow-intensity={1.5}
              shadow-softness="1"
              exposure={exposure}
              rotation-per-second="25deg"
              camera-orbit="0deg 75deg 105%"
              min-camera-orbit="auto auto 10%"
              max-camera-orbit="auto auto 500%"
              bounds="tight"
              camera-target="auto auto auto"
              environment-image="neutral"
              scale="1 1 1"
              style={{
                width: '100%',
                height: '100%',
                backgroundColor: 'transparent',
                '--poster-color': 'transparent',
              } as React.CSSProperties}
            />
          </>
        ) : (
          <div
            className={`absolute inset-0 flex items-center justify-center p-6 text-center ${
              embedded ? 'bg-white text-[#111827]' : 'bg-[#111111] text-white'
            }`}
            role="alert"
          >
            <p className="font-mono text-sm font-bold">허용되지 않거나 비어 있는 3D 모델 URL입니다.</p>
          </div>
        )}

        <div
          className={`pointer-events-none absolute bottom-3 left-3 right-3 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 backdrop-blur-sm ${
            embedded
              ? 'border-[#d1d5db] bg-white/85 text-[#4b5563]'
              : 'border-white/10 bg-black/70 text-[#a0a0a0]'
          }`}
        >
          <span className="font-mono text-[10px]">드래그로 회전 · 휠 또는 두 손가락으로 확대/축소</span>
          <span className="hidden font-mono text-[10px] font-bold sm:inline" style={{ color: accent }}>
            {activeSpec?.badge || '3D VIEW'}
          </span>
        </div>
      </div>
    </section>
  );
}
