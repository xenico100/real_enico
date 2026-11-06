import type { Collection } from './collectionCatalog';
import { NICEPAY_TEST_PRODUCT_ID, type Product } from './productCatalog';
import assets from './corridorAssets.json';

export const CORRIDOR_CHANNEL = 'enico-corridor-v1';

type Attachment = { aspect: number; center: number[]; left: number[]; right: number[] };
type ProductAsset = { cutoutImg: string; attachment: Attachment; mountStyle: string };
const productAssets: Record<string, ProductAsset> = assets.products;
const productOrder = new Map(Object.keys(productAssets).map((id, index) => [id, index]));
const collectionAssets: Record<string, { frameImg: string }> = assets.collections;
const collectionOrder = new Map(Object.keys(collectionAssets).map((id, index) => [id, index]));
const defaultAttachment: Attachment = { aspect: 0.75, center: [0.5, 0], left: [0.25, 0], right: [0.75, 0] };
const categoryLabels: Record<string, string> = {
  '팬츠': 'Pants', '셔츠': 'Shirts', '아우터': 'Outerwear', '가방': 'Bags',
  '인형': 'Dolls', '원피스': 'Dresses', '스커트': 'Skirts', '악세사리': 'Accessories',
  '티셔츠': 'T-Shirts', '니트': 'Knitwear',
};

export type CorridorEvent =
  | { type: 'ready' | 'scene-ready' | 'open-cart' | 'open-community' | 'open-shop-info' | 'close-overlay' }
  | { type: 'open-info'; info: 'about' | 'contact' | 'mypage' }
  | { type: 'open-product' | 'open-collection'; id: string; imageIndex: number }
  | { type: 'add-to-cart'; id: string }
  | { type: 'select'; id: string; kind: 'product' | 'collection' };

/** Commands carry IDs only. The parent resolves prices and stock from its current catalog. */
export function parseCorridorEvent(data: unknown): CorridorEvent | null {
  if (!data || typeof data !== 'object') return null;
  const value = data as Record<string, unknown>;
  if (value.channel !== CORRIDOR_CHANNEL || typeof value.type !== 'string') return null;
  if (['ready', 'scene-ready', 'open-cart', 'open-community', 'open-shop-info', 'close-overlay'].includes(value.type)) {
    return { type: value.type } as CorridorEvent;
  }
  if (value.type === 'open-info' && ['about', 'contact', 'mypage'].includes(String(value.info))) {
    return { type: 'open-info', info: value.info as 'about' | 'contact' | 'mypage' };
  }
  if (typeof value.id !== 'string' || !value.id || value.id.length > 128) return null;
  if (value.type === 'add-to-cart') return { type: 'add-to-cart', id: value.id };
  if (value.type === 'select' && (value.kind === 'product' || value.kind === 'collection')) {
    return { type: 'select', id: value.id, kind: value.kind };
  }
  if (value.type === 'open-product' || value.type === 'open-collection') {
    const imageIndex = value.imageIndex === undefined ? 0 : value.imageIndex;
    if (!Number.isSafeInteger(imageIndex) || Number(imageIndex) < 0 || Number(imageIndex) > 1000) return null;
    return { type: value.type, id: value.id, imageIndex: Number(imageIndex) };
  }
  return null;
}

export function isPurchasableProduct(product: Product | undefined): product is Product {
  return Boolean(product && product.id !== NICEPAY_TEST_PRODUCT_ID && !product.isSoldOut && Number.isSafeInteger(product.price) && product.price > 0);
}

export function visibleCorridorProducts(products: Product[]) {
  return products.filter(product => product.id !== NICEPAY_TEST_PRODUCT_ID && Number.isSafeInteger(product.price) && product.price > 0);
}

function splitName(name: string) {
  const match = name.match(/^([^가-힣]+?)\s+([가-힣].*)$/);
  return match ? { title: match[1].trim(), sub: match[2].trim() } : { title: name, sub: '' };
}

export function buildCorridorCatalog(products: Product[], collections: Collection[]) {
  return {
    pieces: visibleCorridorProducts(products).sort((a, b) => (productOrder.get(a.id) ?? 1000) - (productOrder.get(b.id) ?? 1000) || a.id.localeCompare(b.id)).map((product, index) => {
      const asset = productAssets[product.id];
      return {
        id: product.id, kind: 'product', num: index + 1, ...splitName(product.name),
        fullName: product.name, cat: product.category, catEn: categoryLabels[product.category] || product.category,
        price: product.price, priceText: product.price > 0 ? `${product.price.toLocaleString('ko-KR')}원` : '가격 문의',
        isSoldOut: Boolean(product.isSoldOut), hasCutout: Boolean(asset), cutoutImg: asset?.cutoutImg || product.image,
        attachment: asset?.attachment || defaultAttachment, mountStyle: asset?.mountStyle || 'clip',
        gallery: product.images.length ? product.images : [product.image],
      };
    }),
    collections: collections.filter(collection => !collection.is3dTest).sort((a, b) => (collectionOrder.get(a.id) ?? 1000) - (collectionOrder.get(b.id) ?? 1000) || a.id.localeCompare(b.id)).map((collection, index) => ({
      id: collection.id, kind: 'collection', num: index + 1, title: collection.title,
      sub: collection.description, season: collection.season,
      frameImg: collectionAssets[collection.id]?.frameImg || collection.image,
      gallery: collection.images.length ? collection.images : [collection.image],
      itemsCount: collection.images.length || collection.items,
    })),
  };
}
