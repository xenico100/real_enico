import type { StorefrontCollectionRow } from '@/lib/storefront/shared';

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

const FALLBACK_COLLECTIONS: Collection[] = [
  {
    id: '기록-001',
    title: '디지털 반란',
    season: '가을/겨울 2026',
    description: '지하 저항 세력을 위한 암호화된 패션',
    image:
      'https://images.unsplash.com/photo-1558769132-cb1aea3c8a76?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjeWJlcnB1bmslMjBmYXNoaW9uJTIwZWRpdG9yaWFsfGVufDB8fHx8MTczODY5NTY3M3ww&ixlib=rb-4.1.0&q=80&w=1080',
    images: [
      'https://images.unsplash.com/photo-1558769132-cb1aea3c8a76?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjeWJlcnB1bmslMjBmYXNoaW9uJTIwZWRpdG9yaWFsfGVufDB8fHx8MTczODY5NTY3M3ww&ixlib=rb-4.1.0&q=80&w=1080',
      'https://images.unsplash.com/photo-1504593811423-6dd665756598?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
      'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
      'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
    ],
    items: 24,
    releaseDate: '2026.09.15',
    fullDescription:
      '디지털 반란의 심연에서 태어난 이 컬렉션은 군용급 기능성과 아방가르드 디자인을 결합한다. 각 피스는 획일성에 대한 반발 선언이며, 금지된 기법과 시스템 바깥에서 존재하려는 이들을 위한 구조로 짜였다.',
  },
  {
    id: '기록-002',
    title: '네온 황무지',
    season: '봄/여름 2027',
    description: '문명 폐허 위에서 올라온 포스트 아포칼립스 럭셔리',
    image:
      'https://images.unsplash.com/photo-1509631179647-0177331693ae?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxuZW9uJTIwbGlnaHRzJTIwZmFzaGlvbnxlbnwwfHx8fDE3Mzg2OTU2NzN8MA&ixlib=rb-4.1.0&q=80&w=1080',
    images: [
      'https://images.unsplash.com/photo-1509631179647-0177331693ae?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxuZW9uJTIwbGlnaHRzJTIwZmFzaGlvbnxlbnwwfHx8fDE3Mzg2OTU2NzN8MA&ixlib=rb-4.1.0&q=80&w=1080',
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
      'https://images.unsplash.com/photo-1496747611176-843222e1e57c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
      'https://images.unsplash.com/photo-1445205170230-053b83016050?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
    ],
    items: 18,
    releaseDate: '2027.03.20',
    fullDescription:
      '내일의 전자기 황무지에서 수거한 재료로 완성했다. 생체 발광 원단, 자가 복원 나노 텍스타일, 방사선 저항 코팅이 들어가며 이 컬렉션은 생존 패션의 진화를 보여준다.',
  },
  {
    id: '기록-003',
    title: '고스트 프로토콜',
    season: '가을/겨울 2026',
    description: '감시에겐 보이지 않고, 눈 뜬 자에게만 보이는 컬렉션',
    image:
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwZmFzaGlvbiUyMG1vZGVsfGVufDB8fHx8MTczODY5NTY3M3ww&ixlib=rb-4.1.0&q=80&w=1080',
    images: [
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwZmFzaGlvbiUyMG1vZGVsfGVufDB8fHx8MTczODY5NTY3M3ww&ixlib=rb-4.1.0&q=80&w=1080',
      'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
      'https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
      'https://images.unsplash.com/photo-1534452203293-494d7ddbf7e0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
    ],
    items: 15,
    releaseDate: '2026.11.11',
    fullDescription:
      '그림자 사이를 이동하는 사람을 위해 설계했다. 안면 인식 방해 패턴, 열 신호 교란, 소음 감쇠 소재를 적용했고 각 의복은 대낮에도 존재를 흐리게 만들도록 디자인되었다.',
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

function mapCollectionRow(row: StorefrontCollectionRow): Collection {
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

export function buildCollectionCatalog(rows: StorefrontCollectionRow[]) {
  const collections = rows.map(mapCollectionRow);
  return [...collections].sort((a, b) => {
    const aOtaku = isOtakuCollection(a) ? 1 : 0;
    const bOtaku = isOtakuCollection(b) ? 1 : 0;
    return bOtaku - aOtaku;
  });
}

export function resolveInitialCollectionCatalog(rows: StorefrontCollectionRow[]) {
  const collections = buildCollectionCatalog(rows);

  return {
    collections: collections.length > 0 ? collections : FALLBACK_COLLECTIONS,
    usingFallbackCatalog: collections.length === 0,
  };
}
