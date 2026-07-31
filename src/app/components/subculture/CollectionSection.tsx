'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { shouldBypassImageOptimization } from '@/lib/images';
import {
  buildCollectionCatalog,
  type Collection,
} from '@/lib/storefront/collectionCatalog';
import {
  buildStorefrontSelect,
  extractMissingStorefrontColumn,
  STOREFRONT_COLLECTION_FIELDS,
  type StorefrontCollectionRow,
} from '@/lib/storefront/shared';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

interface CollectionSectionProps {
  initialCollections?: Collection[];
  usingFallbackCatalog?: boolean;
  onCollectionClick: (collection: Collection) => void;
}

export type { Collection };

const EMPTY_COLLECTIONS: Collection[] = [];

export function CollectionSection({
  initialCollections,
  usingFallbackCatalog = false,
  onCollectionClick,
}: CollectionSectionProps) {
  const sourceCollections = initialCollections ?? EMPTY_COLLECTIONS;
  const [recoveredCatalog, setRecoveredCatalog] = useState<{
    source: Collection[];
    collections: Collection[];
  } | null>(null);
  const [isRecoveringCollections, setIsRecoveringCollections] = useState(false);
  const displayedCollections =
    usingFallbackCatalog && recoveredCatalog?.source === sourceCollections
      ? recoveredCatalog.collections
      : sourceCollections;

  useEffect(() => {
    if (!usingFallbackCatalog) return;

    let active = true;

    const recoverCollections = async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;

      setIsRecoveringCollections(true);

      try {
        let fields: string[] = [...STOREFRONT_COLLECTION_FIELDS];
        let orderColumn: 'created_at' | 'updated_at' | null = 'created_at';
        let usePublishedFilter = true;
        let data: StorefrontCollectionRow[] | null = null;
        let error: { message?: string } | null = null;

        for (let attempt = 0; attempt < STOREFRONT_COLLECTION_FIELDS.length + 5; attempt += 1) {
          let query = supabase.from('collections').select(buildStorefrontSelect(fields));

          if (usePublishedFilter) {
            query = query.eq('is_published', true);
          }

          if (orderColumn) {
            query = query.order(orderColumn, { ascending: false });
          }

          const result = await query.returns<StorefrontCollectionRow[]>();
          data = result.data;
          error = result.error;

          if (!error) {
            break;
          }

          const message = (error.message || '').toLowerCase();
          const missingColumn = extractMissingStorefrontColumn(error);

          if (usePublishedFilter && message.includes('is_published')) {
            usePublishedFilter = false;
            continue;
          }

          if (orderColumn && message.includes(orderColumn)) {
            orderColumn = orderColumn === 'created_at' ? 'updated_at' : null;
            continue;
          }

          if (missingColumn && fields.includes(missingColumn)) {
            fields = fields.filter((field) => field !== missingColumn);
            continue;
          }

          break;
        }

        if (error || !active) return;

        const recoveredCollections = buildCollectionCatalog(
          (data ?? []) as StorefrontCollectionRow[],
        );
        if (recoveredCollections.length > 0) {
          setRecoveredCatalog({
            source: sourceCollections,
            collections: recoveredCollections,
          });
        }
      } finally {
        if (active) {
          setIsRecoveringCollections(false);
        }
      }
    };

    void recoverCollections();

    return () => {
      active = false;
    };
  }, [sourceCollections, usingFallbackCatalog]);

  return (
    <section
      id="collection-section"
      className="py-20 bg-[#e5e5e5] text-black relative overflow-hidden scroll-mt-24"
    >
      <div className="absolute inset-0 opacity-20 bg-[linear-gradient(rgba(0,0,0,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.035)_1px,transparent_1px)] bg-[size:18px_18px]" />

      <div className="px-6 md:px-12 relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-end mb-20 border-b-4 border-black pb-4">
          <div>
            <h2 className="text-[10.5rem] md:text-[12rem] lg:text-[14rem] font-black font-heading uppercase tracking-tighter leading-[0.86]">
              컬렉션
            </h2>
          </div>
        </div>

        {usingFallbackCatalog ? (
          <div className="mb-6 border border-black/20 bg-white/80 px-4 py-3 font-mono text-[11px] text-black/60">
            {isRecoveringCollections
              ? '실제 컬렉션 게시물을 다시 불러오는 중입니다...'
              : '실제 컬렉션 게시물을 찾지 못했습니다. 샘플 이미지는 더 이상 표시하지 않습니다.'}
          </div>
        ) : null}

        {displayedCollections.length === 0 ? (
          <div className="border-2 border-black bg-white p-10 text-center">
            <p className="font-heading text-4xl uppercase leading-none">컬렉션 없음</p>
            <p className="font-mono text-xs text-black/60 mt-4">
              곧 새로운 컬렉션 게시물이 올라옵니다.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-3">
            {displayedCollections.map((collection, index) => (
              <div
                key={collection.id}
                role="button"
                tabIndex={0}
                aria-label={`${collection.title} 컬렉션 상세 보기`}
                onClick={() => onCollectionClick(collection)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onCollectionClick(collection);
                  }
                }}
                className="group cursor-pointer relative focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[#b8001f]"
              >
                <div className="absolute top-2 left-2 w-full h-full bg-black/10 -z-10 rotate-2 group-hover:rotate-4 transition-transform duration-300" />
                <div className="absolute top-4 left-4 w-full h-full bg-black/5 -z-20 rotate-4 group-hover:rotate-6 transition-transform duration-300" />

                <div className="bg-white p-4 border-2 border-black h-full flex flex-col justify-between relative shadow-xl">
                  <div className="relative aspect-[4/5] overflow-hidden border border-black mb-6">
                    <div className="absolute inset-0 bg-[#b8001f] mix-blend-multiply opacity-0 group-hover:opacity-40 transition-opacity duration-300 z-10" />
                    {collection.image ? (
                      <Image
                        src={collection.image}
                        alt={collection.title}
                        fill
                        unoptimized={shouldBypassImageOptimization(collection.image)}
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        className="object-contain bg-white"
                      />
                    ) : (
                      <div className="w-full h-full bg-white flex items-center justify-center font-mono text-xs text-black/50">
                        IMAGE
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-4">
                    <div>
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <span className="font-mono text-[10px] uppercase border border-black px-2 py-1">
                          {collection.season || 'SEASONLESS'}
                        </span>
                        <span className="font-heading text-4xl leading-none">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                      </div>

                      <h3 className="font-heading text-[2.8rem] uppercase leading-[0.92] tracking-tight mb-4">
                        {collection.title}
                      </h3>
                      <p className="font-mono text-xs leading-relaxed text-black/80 line-clamp-4">
                        {collection.description}
                      </p>
                    </div>

                    <div className="border-t border-black pt-4 flex justify-between items-center">
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-widest text-black/60">
                          RELEASE
                        </p>
                        <p className="font-mono text-xs mt-1">
                          {collection.releaseDate || 'TBA'}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 group-hover:translate-x-1 transition-transform duration-300">
                        <span className="font-mono text-[10px] uppercase tracking-widest">
                          상세 보기
                        </span>
                        <span className="text-xl">+</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
