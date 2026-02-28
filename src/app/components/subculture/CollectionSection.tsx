'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export interface Collection {
  id: string;
  title: string;
  season: string;
  description: string;
  image: string;
  images: string[];
  items: number;
  releaseDate: string;
  fullDescription: string;
}

type CollectionRow = {
  id: string;
  title: string | null;
  season: string | null;
  description: string | null;
  full_description: string | null;
  release_date: string | null;
  items: number | string | null;
  image: string | null;
  images: unknown;
  is_published?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const fallbackCollections: Collection[] = [
  {
    id: '기록-001',
    title: '디지털 반란',
    season: '가을/겨울 2026',
    description: '지하 저항 세력을 위한 암호화된 패션',
    image: 'https://images.unsplash.com/photo-1558769132-cb1aea3c8a76?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjeWJlcnB1bmslMjBmYXNoaW9uJTIwZWRpdG9yaWFsfGVufDB8fHx8MTczODY5NTY3M3ww&ixlib=rb-4.1.0&q=80&w=1080',
    images: [
      'https://images.unsplash.com/photo-1558769132-cb1aea3c8a76?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjeWJlcnB1bmslMjBmYXNoaW9uJTIwZWRpdG9yaWFsfGVufDB8fHx8MTczODY5NTY3M3ww&ixlib=rb-4.1.0&q=80&w=1080',
      'https://images.unsplash.com/photo-1504593811423-6dd665756598?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
      'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
      'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
    ],
    items: 24,
    releaseDate: '2026.09.15',
    fullDescription: '디지털 반란의 심연에서 태어난 이 컬렉션은 군용급 기능성과 아방가르드 디자인을 결합한다. 각 피스는 획일성에 대한 반발 선언이며, 금지된 기법과 시스템 바깥에서 존재하려는 이들을 위한 구조로 짜였다.',
  },
  {
    id: '기록-002',
    title: '네온 황무지',
    season: '봄/여름 2027',
    description: '문명 폐허 위에서 올라온 포스트 아포칼립스 럭셔리',
    image: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxuZW9uJTIwbGlnaHRzJTIwZmFzaGlvbnxlbnwwfHx8fDE3Mzg2OTU2NzN8MA&ixlib=rb-4.1.0&q=80&w=1080',
    images: [
      'https://images.unsplash.com/photo-1509631179647-0177331693ae?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxuZW9uJTIwbGlnaHRzJTIwZmFzaGlvbnxlbnwwfHx8fDE3Mzg2OTU2NzN8MA&ixlib=rb-4.1.0&q=80&w=1080',
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
      'https://images.unsplash.com/photo-1496747611176-843222e1e57c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
      'https://images.unsplash.com/photo-1445205170230-053b83016050?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
    ],
    items: 18,
    releaseDate: '2027.03.20',
    fullDescription: '내일의 전자기 황무지에서 수거한 재료로 완성했다. 생체 발광 원단, 자가 복원 나노 텍스타일, 방사선 저항 코팅이 들어가며 이 컬렉션은 생존 패션의 진화를 보여준다.',
  },
  {
    id: '기록-003',
    title: '고스트 프로토콜',
    season: '가을/겨울 2026',
    description: '감시에겐 보이지 않고, 눈 뜬 자에게만 보이는 컬렉션',
    image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwZmFzaGlvbiUyMG1vZGVsfGVufDB8fHx8MTczODY5NTY3M3ww&ixlib=rb-4.1.0&q=80&w=1080',
    images: [
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwZmFzaGlvbiUyMG1vZGVsfGVufDB8fHx8MTczODY5NTY3M3ww&ixlib=rb-4.1.0&q=80&w=1080',
      'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
      'https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
      'https://images.unsplash.com/photo-1534452203293-494d7ddbf7e0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
    ],
    items: 15,
    releaseDate: '2026.11.11',
    fullDescription: '그림자 사이를 이동하는 사람을 위해 설계했다. 안면 인식 방해 패턴, 열 신호 교란, 소음 감쇠 소재를 적용했고 각 의복은 대낮에도 존재를 흐리게 만들도록 디자인되었다.',
  },
];

function normalizeCollectionImages(value: unknown, primaryImage?: string | null) {
  const parsed: string[] = [];

  if (Array.isArray(value)) {
    parsed.push(
      ...value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0),
    );
  } else if (typeof value === 'string') {
    try {
      const json = JSON.parse(value);
      if (Array.isArray(json)) {
        parsed.push(
          ...json.filter((item): item is string => typeof item === 'string' && item.trim().length > 0),
        );
      }
    } catch {
      if (value.trim()) parsed.push(value);
    }
  }

  if (primaryImage?.trim()) {
    parsed.unshift(primaryImage);
  }

  return Array.from(new Set(parsed.map((item) => item.trim()).filter(Boolean)));
}

function mapCollectionRow(row: CollectionRow): Collection {
  const images = normalizeCollectionImages(row.images, row.image);
  const numericItems = Number(row.items);

  return {
    id: row.id,
    title: row.title?.trim() || '제목 없음',
    season: row.season?.trim() || '',
    description: row.description?.trim() || '',
    image: images[0] || '',
    images,
    items: Number.isFinite(numericItems) ? numericItems : 0,
    releaseDate: row.release_date?.trim() || '',
    fullDescription: row.full_description?.trim() || row.description?.trim() || '',
  };
}

function isOtakuCollection(collection: Collection) {
  const key = `${collection.title} ${collection.season}`.toLowerCase();
  return key.includes('otaku');
}

interface CollectionSectionProps {
  onCollectionClick: (collection: Collection) => void;
}

export function CollectionSection({ onCollectionClick }: CollectionSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [isLoadingCollections, setIsLoadingCollections] = useState(false);
  const [collectionLoadError, setCollectionLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadCollections = async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;

      setIsLoadingCollections(true);
      setCollectionLoadError(null);

      try {
        let { data, error } = await supabase
          .from('collections')
          .select('*')
          .eq('is_published', true)
          .order('created_at', { ascending: false });

        if (error?.message?.toLowerCase().includes('is_published')) {
          const fallback = await supabase
            .from('collections')
            .select('*')
            .order('created_at', { ascending: false });
          data = fallback.data;
          error = fallback.error;
        }

        if (error) throw error;
        if (!active) return;

        const mapped = ((data ?? []) as Array<Record<string, unknown>>)
          .map((row) => row as CollectionRow)
          .map(mapCollectionRow);
        const ordered = [...mapped].sort((a, b) => {
          const aOtaku = isOtakuCollection(a) ? 1 : 0;
          const bOtaku = isOtakuCollection(b) ? 1 : 0;
          return bOtaku - aOtaku;
        });
        setCollections(ordered);
      } catch (error) {
        if (!active) return;
        setCollectionLoadError(
          error instanceof Error ? error.message : '컬렉션 게시물 로드 실패',
        );
      } finally {
        if (active) setIsLoadingCollections(false);
      }
    };

    void loadCollections();

    return () => {
      active = false;
    };
  }, []);

  const visibleCollections = collections ?? fallbackCollections;

  return (
    <section id="collection-section" className="py-20 bg-[#e5e5e5] text-black relative overflow-hidden scroll-mt-24" ref={containerRef}>
      
      {/* Tape/Paper Background Effect */}
      <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/crumpled-paper.png')]" />

      <div className="px-6 md:px-12 relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-end mb-20 border-b-4 border-black pb-4">
          <div>
            <h2 className="text-[10.5rem] md:text-[12rem] lg:text-[14rem] font-black font-heading uppercase tracking-tighter leading-[0.86]">
              컬렉션
            </h2>
          </div>
        </div>

        {collectionLoadError && collections === null && (
          <div className="mb-6 border border-black/20 bg-white/80 px-4 py-3 font-mono text-[11px] text-black/60">
            컬렉션 DB 로드 실패로 기본 게시물을 표시 중입니다.
          </div>
        )}

        {isLoadingCollections && collections === null ? (
          <div className="border-2 border-black bg-white p-10 font-mono text-sm text-black/70 text-center">
            컬렉션 게시물 불러오는 중...
          </div>
        ) : visibleCollections.length === 0 ? (
          <div className="border-2 border-black bg-white p-10 text-center">
            <p className="font-heading text-4xl uppercase leading-none">컬렉션 없음</p>
            <p className="font-mono text-xs text-black/60 mt-4">
              곧 새로운 컬렉션 게시물이 올라옵니다.
            </p>
          </div>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
          {visibleCollections.map((collection, index) => (
            <motion.div
              key={collection.id}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true }}
              onClick={() => onCollectionClick(collection)}
              className="group cursor-pointer relative"
            >
              {/* Paper Stack Effect */}
              <div className="absolute top-2 left-2 w-full h-full bg-black/10 -z-10 rotate-2 group-hover:rotate-4 transition-transform duration-300" />
              <div className="absolute top-4 left-4 w-full h-full bg-black/5 -z-20 rotate-4 group-hover:rotate-6 transition-transform duration-300" />
              
              <div className="bg-white p-4 border-2 border-black h-full flex flex-col justify-between relative shadow-xl">
                
                {/* Image Area */}
                <div className="relative aspect-[4/5] overflow-hidden border border-black mb-6">
                   <div className="absolute inset-0 bg-[#00ffd1] mix-blend-multiply opacity-0 group-hover:opacity-40 transition-opacity duration-300 z-10" />
                   {collection.image ? (
                     <img 
                       src={collection.image} 
                       alt={collection.title}
                       className="w-full h-full object-contain bg-white"
                     />
                   ) : (
                     <div className="w-full h-full bg-white flex items-center justify-center font-mono text-xs text-black/50">
                       이미지 없음
                     </div>
                   )}
                   
                   {/* "STAMP" */}
                   <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border-4 border-[#00ffd1] rounded-full flex items-center justify-center -rotate-12 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20 mix-blend-hard-light">
                     <span className="text-[#00ffd1] font-heading font-bold text-xl uppercase text-center leading-none">
                       기밀<br/>기록물
                     </span>
                   </div>
                </div>

                {/* Text Area */}
                <div className="space-y-2">
                  {collection.season.trim().length > 0 && (
                    <div className="border-b border-black pb-2">
                      <span className="font-mono text-xs text-gray-500">{collection.season}</span>
                    </div>
                  )}
                  
                  <h3 className="text-3xl font-heading uppercase leading-none break-words group-hover:text-[#00ffd1] transition-colors">
                    {collection.title}
                  </h3>
                  
                  {collection.description.trim().length > 0 && (
                    <p className="font-mono text-xs leading-relaxed text-gray-600 line-clamp-3">
                      {collection.description}
                    </p>
                  )}

                  <div className="pt-4 flex justify-end">
                    <span className="text-xs font-bold font-mono underline decoration-2 decoration-[#00ffd1] group-hover:bg-[#00ffd1] group-hover:text-black group-hover:no-underline px-1 transition-all">
                      기록 보기 →
                    </span>
                  </div>
                </div>

                {/* Tape Effect */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-24 h-8 bg-[#e5e5e5] opacity-80 rotate-[-2deg] shadow-sm z-30" />
              </div>
            </motion.div>
          ))}
        </div>
        )}
      </div>
    </section>
  );
}
