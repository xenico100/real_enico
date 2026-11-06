import type { FashionCartItem } from '@/app/context/FashionCartContext';

export const CART_STORAGE_KEY = 'enicoveck:cart:v1';
const MAX_SAVED_ITEMS = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CartSelection {
  id: string;
  selectedSize: string | null;
}

export type CartMutation =
  | { type: 'add'; item: FashionCartItem }
  | { type: 'remove'; id: string; selectedSize?: string | null }
  | { type: 'updateQuantity'; id: string; quantity: number; selectedSize?: string | null }
  | { type: 'clear' };

export function cartSelectionKey(id: string, selectedSize?: string | null) {
  return JSON.stringify([id, selectedSize?.trim() || null]);
}

export function normalizeCartSelections(value: unknown): CartSelection[] {
  if (!Array.isArray(value)) return [];
  const selections: CartSelection[] = [];
  const keys = new Set<string>();
  for (const entry of value.slice(0, MAX_SAVED_ITEMS)) {
    if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || !UUID.test(entry.id)) continue;
    if (entry.selectedSize != null && (typeof entry.selectedSize !== 'string' || entry.selectedSize.length > 40)) continue;
    const selectedSize = entry.selectedSize?.trim() || null;
    const key = cartSelectionKey(entry.id, selectedSize);
    if (keys.has(key)) continue;
    keys.add(key);
    // Never retain product text, prices, account details, or checkout information.
    selections.push({ id: entry.id, selectedSize });
  }
  return selections;
}

export function readCartSelections(storage: Pick<Storage, 'getItem'>): CartSelection[] {
  try {
    const raw = storage.getItem(CART_STORAGE_KEY);
    if (!raw || raw.length > 30000) return [];
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== 'object' || !('version' in saved) || saved.version !== 1 || !('items' in saved)) return [];
    return normalizeCartSelections(saved.items);
  } catch {
    return [];
  }
}

export function writeCartSelections(storage: Pick<Storage, 'setItem'>, selections: CartSelection[]) {
  try {
    storage.setItem(CART_STORAGE_KEY, JSON.stringify({ version: 1, items: normalizeCartSelections(selections) }));
  } catch {
    // Private browsing, disabled storage, and quota limits must not break shopping.
  }
}

export function applyCartSelectionMutation(selections: CartSelection[], action: CartMutation): CartSelection[] {
  if (action.type === 'clear') return [];
  if (action.type === 'add') return normalizeCartSelections([...selections, action.item]);
  if (action.type === 'updateQuantity' && !(action.quantity <= 0)) return selections;
  const key = cartSelectionKey(action.id, action.selectedSize);
  return selections.filter((item) => cartSelectionKey(item.id, item.selectedSize) !== key);
}

export function restoreCanonicalCart(selections: CartSelection[], payload: unknown): FashionCartItem[] {
  if (!payload || typeof payload !== 'object' || !('products' in payload) || !Array.isArray(payload.products)) {
    throw new Error('Invalid storefront response');
  }
  const products = new Map<string, Record<string, unknown>>();
  for (const value of payload.products) {
    if (value && typeof value === 'object' && typeof value.id === 'string') products.set(value.id, value);
  }
  return normalizeCartSelections(selections).flatMap((selection) => {
    const product = products.get(selection.id);
    // The public feed excludes unpublished, deleted and sold-out products.
    if (!product || product.isSoldOut === true || product.currency !== 'KRW' || typeof product.title !== 'string' || !product.title.trim() || typeof product.price !== 'number' || !Number.isSafeInteger(product.price) || product.price <= 0) return [];
    if (selection.selectedSize && (!Array.isArray(product.sizes) || !product.sizes.includes(selection.selectedSize))) return [];
    const image = Array.isArray(product.images) ? product.images.find((value) => typeof value === 'string' && /^https:\/\//.test(value)) : '';
    return [{
      id: selection.id,
      name: product.title,
      price: product.price,
      quantity: 1,
      image: image || '',
      category: typeof product.category === 'string' ? product.category : undefined,
      selectedSize: selection.selectedSize,
    }];
  });
}
