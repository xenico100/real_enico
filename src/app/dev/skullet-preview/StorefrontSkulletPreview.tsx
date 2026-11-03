'use client';

import { useEffect, useState } from 'react';
import { Skeleton } from 'skullet/react';
import { SubcultureHeader } from '@/app/components/subculture/SubcultureHeader';
import { ProductShowcase } from '@/app/components/subculture/ProductShowcase';
import { CollectionSection } from '@/app/components/subculture/CollectionSection';
import { CustomerOrderCard } from '@/app/components/subculture/CustomerOrderCard';
import myPageStyles from '@/app/components/subculture/MyPagePanel.module.css';
import { FashionCartProvider } from '@/app/context/FashionCartContext';
import type { Collection } from '@/lib/storefront/collectionCatalog';
import type { Product } from '@/lib/storefront/productCatalog';
import { CUSTOMER_ORDER_CARD_SAMPLES } from '@/lib/storefront/skulletSamples';

type DemoSection = 'apparel' | 'collections' | 'orders';
type SpeedPreset = 'normal' | 'fast';

const noop = () => {};

export function StorefrontSkulletPreview({
  products,
  collections,
}: {
  products: Product[];
  collections: Collection[];
}) {
  const [section, setSection] = useState<DemoSection>('apparel');
  const [speedPreset, setSpeedPreset] = useState<SpeedPreset>('normal');
  const [cycle, setCycle] = useState(0);
  const targetKey = `${section}:${speedPreset}:${cycle}`;
  const [resolvedKey, setResolvedKey] = useState<string>('');
  const loading = resolvedKey !== targetKey;

  useEffect(() => {
    const delayMs = speedPreset === 'fast' ? 60 : 1250;
    const timer = window.setTimeout(() => {
      setResolvedKey(targetKey);
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [speedPreset, targetKey]);

  return (
    <FashionCartProvider>
      <div className="relative min-h-screen w-full overflow-x-hidden bg-[#f8f9fa] font-mono text-[#111827]">
        <SubcultureHeader
          onCartClick={noop}
          onInfoClick={noop}
          onRandomChatClick={noop}
        />

        <div className="mt-[96px] sticky top-[96px] z-[60] border-y border-[#d1d5db] bg-white/95 backdrop-blur px-4 py-3 md:px-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="border border-[#b8001f] bg-[#fff1f2] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#b8001f]">
                ENICO VECK · SKULLET LIVE PREVIEW
              </span>
              <span className="text-xs font-semibold text-[#4b5563]">
                실제 컴포넌트 치수 측정 · 레이아웃 시프트 0px
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  ['apparel', '의류 카탈로그'],
                  ['collections', '컬렉션 아카이브'],
                  ['orders', '주문·배송 카드'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setSpeedPreset('normal');
                    setSection(id);
                  }}
                  aria-pressed={section === id}
                  className={`border px-3 py-1.5 text-xs font-bold uppercase transition-colors ${
                    section === id
                      ? 'border-[#b8001f] bg-[#b8001f] text-white'
                      : 'border-[#d1d5db] bg-[#f8f9fa] text-[#111827] hover:border-[#b8001f]'
                  }`}
                >
                  {label}
                </button>
              ))}

              <button
                type="button"
                onClick={() => {
                  setSpeedPreset('normal');
                  setCycle((value) => value + 1);
                }}
                className="border border-[#111827] bg-[#111827] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#b8001f] hover:border-[#b8001f] transition-colors"
              >
                로딩 리빌 재실행 (1.2s)
              </button>

              <button
                type="button"
                onClick={() => {
                  setSpeedPreset('fast');
                  setCycle((value) => value + 1);
                }}
                className="border border-[#d1d5db] bg-white px-3 py-1.5 text-xs font-bold text-[#111827] hover:border-[#b8001f] transition-colors"
              >
                고속 응답 (60ms · 스켈레톤 생략)
              </button>
            </div>
          </div>
        </div>

        <main className="relative z-10 pt-2">
          {section === 'apparel' ? (
            <ProductShowcase
              key={`apparel-${cycle}`}
              initialProducts={loading ? [] : products}
              loading={loading}
              onProductClick={noop}
            />
          ) : null}

          {section === 'collections' ? (
            <CollectionSection
              key={`collections-${cycle}`}
              initialCollections={loading ? [] : collections}
              loading={loading}
              onCollectionClick={noop}
            />
          ) : null}

          {section === 'orders' ? (
            <section className={`mx-auto max-w-6xl px-4 py-10 md:px-10 ${myPageStyles.shell}`}>
              <div className="border border-[#d1d5db] bg-white p-6 md:p-8 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#b8001f]">
                  ENICO VECK / ORDERS
                </p>
                <h2 className="mt-2 text-2xl font-bold text-[#111827]">내 주문 · 입금 · 배송 조회</h2>
                <p className="mt-1 text-xs text-[#4b5563]">
                  실제 CustomerOrderCard 컴포넌트를 측정한 스켈레톤에서 주문 상세로 시프트 없이 전환됩니다.
                </p>

                <div className="mt-6">
                  <Skeleton
                    key={`orders-${cycle}`}
                    id="preview-customer-orders"
                    loading={loading}
                    label="주문 내역을 확인하고 있습니다. 잠시만 기다려 주세요."
                  >
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      {CUSTOMER_ORDER_CARD_SAMPLES.map((order, index) => (
                        <CustomerOrderCard key={order.id} order={order} index={index} />
                      ))}
                    </div>
                  </Skeleton>
                </div>
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </FashionCartProvider>
  );
}
