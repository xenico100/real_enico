'use client';

import { Skeleton } from 'skullet/react';
import { DarkSkulletBoundary } from '@/app/components/system/StorefrontSkulletProvider';
import { STOREFRONT_PRODUCT_SAMPLES } from '@/lib/storefront/skulletSamples';

export default function StudioLoading() {
  return (
    <DarkSkulletBoundary>
      <main className="min-h-screen bg-[#050505] text-[#e5e5e5] p-6 md:p-10" aria-busy="true">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 border-b border-[#333] pb-4">
            <h1 className="text-5xl md:text-7xl font-heading font-black uppercase tracking-tight">
              Studio
            </h1>
            <p className="font-mono text-xs text-[#888] mt-2">
              Supabase `products` 목록
            </p>
          </div>
          <Skeleton
            id="studio-catalog-loading"
            loading
            label="스튜디오 상품 목록을 불러오는 중입니다."
          >
            <section className="space-y-3">
              <h2 className="font-heading text-3xl uppercase tracking-tight text-[#00ffd1]">
                아카이브 컬렉션
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {STOREFRONT_PRODUCT_SAMPLES.map((product) => (
                  <div
                    key={product.id}
                    className="border border-[#333] bg-[#0a0a0a] overflow-hidden"
                  >
                    <div className="aspect-[4/5] bg-black border-b border-[#222]" />
                    <div className="p-3 space-y-2">
                      <h2 className="font-heading text-2xl leading-none break-words">
                        {product.name}
                      </h2>
                      <p className="font-mono text-sm text-[#00ffd1]">
                        {product.price.toLocaleString('ko-KR')}원
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </Skeleton>
        </div>
      </main>
    </DarkSkulletBoundary>
  );
}
