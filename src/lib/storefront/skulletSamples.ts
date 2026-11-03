import type { Collection } from '@/lib/storefront/collectionCatalog';
import type { Product } from '@/lib/storefront/productCatalog';
import type { CustomerOrderCardData } from '@/app/components/subculture/CustomerOrderCard';

const TRANSPARENT_PLACEHOLDER =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><rect width="1080" height="1350" fill="%23f3f4f6"/></svg>';

export const STOREFRONT_PRODUCT_SAMPLES: Product[] = [
  {
    id: 'skullet-product-1',
    name: 'Archive Structured Jacket 아카이브 테일러드 재킷',
    price: 228000,
    category: '아우터',
    image: TRANSPARENT_PLACEHOLDER,
    images: [TRANSPARENT_PLACEHOLDER],
    description: '구조적인 실루엣과 메탈 디테일을 결합한 아카이브 아우터.',
  },
  {
    id: 'skullet-product-2',
    name: 'Subculture Pleated Shirt 서브컬처 플리츠 셔츠',
    price: 148000,
    category: '셔츠',
    image: TRANSPARENT_PLACEHOLDER,
    images: [TRANSPARENT_PLACEHOLDER],
    description: '비대칭 절개 라인과 정교한 스티치를 더한 셔츠.',
  },
  {
    id: 'skullet-product-3',
    name: 'Distressed Cargo Wide Pants 디스트레스드 카고 팬츠',
    price: 186000,
    category: '팬츠',
    image: TRANSPARENT_PLACEHOLDER,
    images: [TRANSPARENT_PLACEHOLDER],
    description: '입체 포켓과 워싱 텍스처가 돋보이는 와이드 팬츠.',
  },
  {
    id: 'skullet-product-4',
    name: 'Nocturne Leather Cross Bag 녹턴 레더 크로스백',
    price: 162000,
    category: '가방',
    image: TRANSPARENT_PLACEHOLDER,
    images: [TRANSPARENT_PLACEHOLDER],
    description: '매트 하드웨어와 수납 실용성을 갖춘 아카이브 백.',
  },
];

export const STOREFRONT_COLLECTION_SAMPLES: Collection[] = [
  {
    id: 'skullet-collection-1',
    title: 'NOCTURNE ARCHIVE 01',
    season: '2026 AW',
    releaseDate: '2026.10',
    items: 8,
    description: '도시 야간의 잔상과 산업적 텍스처를 재해석한 아카이브.',
    fullDescription: '도시 야간의 잔상과 산업적 텍스처를 재해석한 아카이브.',
    image: TRANSPARENT_PLACEHOLDER,
    images: [TRANSPARENT_PLACEHOLDER],
  },
  {
    id: 'skullet-collection-2',
    title: 'SILENT FRAGMENTS',
    season: '2026 SS',
    releaseDate: '2026.06',
    items: 6,
    description: '해체주의 테일러링과 모노톤 레이어링 캡슐 컬렉션.',
    fullDescription: '해체주의 테일러링과 모노톤 레이어링 캡슐 컬렉션.',
    image: TRANSPARENT_PLACEHOLDER,
    images: [TRANSPARENT_PLACEHOLDER],
  },
  {
    id: 'skullet-collection-3',
    title: 'CHROME REVERIE',
    season: 'ARCHIVE',
    releaseDate: '2026.03',
    items: 5,
    description: '금속 오브제와 구조적 실루엣의 에디토리얼 기록.',
    fullDescription: '금속 오브제와 구조적 실루엣의 에디토리얼 기록.',
    image: TRANSPARENT_PLACEHOLDER,
    images: [TRANSPARENT_PLACEHOLDER],
  },
];

export const CUSTOMER_ORDER_CARD_SAMPLES: CustomerOrderCardData[] = [
  {
    id: 'skullet-customer-order-1',
    orderCode: 'ENV-20261103-0184',
    guestOrderNumber: '',
    paymentMethod: 'nicepay',
    paymentStatus: 'paid',
    currency: 'KRW',
    amountTotal: 228000,
    customerAddress: '서울특별시 성동구 연무장길 아카이브 스튜디오',
    shippingStatus: 'shipping',
    shippingCompany: '우체국',
    trackingNumber: '6864100000000',
    shippingNote: '검수 완료 후 안전하게 출고되었습니다.',
    shippedAt: '2026-11-03T01:00:00.000Z',
    deliveredAt: null,
    createdAt: '2026-11-02T14:20:00.000Z',
    items: [
      {
        id: 'skullet-order-item-1',
        name: 'Archive Structured Jacket',
        category: '아우터',
        selectedSize: 'L',
        quantity: 1,
        unitPrice: 228000,
        lineTotal: 228000,
        image: TRANSPARENT_PLACEHOLDER,
      },
    ],
    notifications: {
      customerSms: { status: 'sent', event: 'shipping_started' },
    },
  },
  {
    id: 'skullet-customer-order-2',
    orderCode: 'ENV-20261029-0142',
    guestOrderNumber: '',
    paymentMethod: 'bank_transfer',
    paymentStatus: 'transfer_confirmed',
    currency: 'KRW',
    amountTotal: 148000,
    customerAddress: '서울특별시 마포구 독막로 스튜디오 쇼룸',
    shippingStatus: 'delivered',
    shippingCompany: '우체국',
    trackingNumber: '6864100000001',
    shippingNote: '',
    shippedAt: '2026-10-30T03:00:00.000Z',
    deliveredAt: '2026-10-31T06:00:00.000Z',
    createdAt: '2026-10-29T11:00:00.000Z',
    items: [
      {
        id: 'skullet-order-item-2',
        name: 'Subculture Pleated Shirt',
        category: '셔츠',
        selectedSize: 'M',
        quantity: 1,
        unitPrice: 148000,
        lineTotal: 148000,
        image: TRANSPARENT_PLACEHOLDER,
      },
    ],
  },
];
