'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import {
  applyCartSelectionMutation,
  normalizeCartSelections,
  readCartSelections,
  restoreCanonicalCart,
  writeCartSelections,
  type CartMutation,
  type CartSelection,
} from '@/lib/storefront/cartPersistence';
import { trackStorefrontEvent } from '@/app/components/system/VisitTracker';

export interface FashionCartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  category?: string;
  selectedSize?: string | null;
}

export interface FashionCartAdditionFeedback {
  itemKey: string;
  itemName: string;
  cartCount: number;
  sequence: number;
}

interface FashionCartContextType {
  cart: FashionCartItem[];
  lastAddedItem: FashionCartAdditionFeedback | null;
  addToCart: (item: FashionCartItem) => void;
  removeFromCart: (id: string, selectedSize?: string | null) => void;
  updateQuantity: (id: string, quantity: number, selectedSize?: string | null) => void;
  clearCart: () => void;
}

const FashionCartContext = createContext<FashionCartContextType | undefined>(undefined);
const MAX_CART_ITEM_QUANTITY = 1;
const CART_FEEDBACK_DURATION_MS = 950;

interface FashionCartState {
  cart: FashionCartItem[];
  lastAddedItem: FashionCartAdditionFeedback | null;
  additionSequence: number;
  savedSelections: CartSelection[] | null;
  restored: boolean;
  pendingMutations: CartMutation[];
}

type FashionCartAction = CartMutation
  | { type: 'clearFeedback' }
  | { type: 'readSelections'; selections: CartSelection[] }
  | { type: 'restore'; items: FashionCartItem[] | null; selections: CartSelection[] };

export function getFashionCartItemKey(id: string, selectedSize?: string | null) {
  return `${id}::${selectedSize?.trim() || ''}`;
}

function applyFashionCartAction(
  state: FashionCartState,
  action: CartMutation | { type: 'clearFeedback' },
): FashionCartState {
  switch (action.type) {
    case 'add': {
      const nextItemKey = getFashionCartItemKey(action.item.id, action.item.selectedSize);
      const existingItem = state.cart.find(
        (cartItem) =>
          getFashionCartItemKey(cartItem.id, cartItem.selectedSize) === nextItemKey,
      );
      const normalizedQuantity = MAX_CART_ITEM_QUANTITY;

      if (existingItem) {
        return {
          ...state,
          cart: state.cart.map((item) =>
            getFashionCartItemKey(item.id, item.selectedSize) === nextItemKey
              ? {
                  ...item,
                  quantity: MAX_CART_ITEM_QUANTITY,
                }
              : item,
          ),
        };
      }

      const nextCart = [...state.cart, { ...action.item, quantity: normalizedQuantity }];
      const nextSequence = state.additionSequence + 1;

      return {
        ...state,
        cart: nextCart,
        additionSequence: nextSequence,
        lastAddedItem: {
          itemKey: nextItemKey,
          itemName: action.item.name,
          cartCount: nextCart.length,
          sequence: nextSequence,
        },
      };
    }
    case 'remove': {
      const targetKey = getFashionCartItemKey(action.id, action.selectedSize);

      return {
        ...state,
        cart: state.cart.filter(
          (item) => getFashionCartItemKey(item.id, item.selectedSize) !== targetKey,
        ),
      };
    }
    case 'updateQuantity': {
      const targetKey = getFashionCartItemKey(action.id, action.selectedSize);

      if (action.quantity <= 0) {
        return {
          ...state,
          cart: state.cart.filter(
            (item) => getFashionCartItemKey(item.id, item.selectedSize) !== targetKey,
          ),
        };
      }

      return {
        ...state,
        cart: state.cart.map((item) =>
          getFashionCartItemKey(item.id, item.selectedSize) === targetKey
            ? {
                ...item,
                quantity: MAX_CART_ITEM_QUANTITY,
              }
            : item,
        ),
      };
    }
    case 'clear':
      return {
        ...state,
        cart: [],
        lastAddedItem: null,
      };
    case 'clearFeedback':
      return state.lastAddedItem ? { ...state, lastAddedItem: null } : state;
    default:
      return state;
  }
}

export function fashionCartReducer(state: FashionCartState, action: FashionCartAction): FashionCartState {
  if (action.type === 'readSelections') {
    if (state.savedSelections !== null) return state;
    return { ...state, savedSelections: state.pendingMutations.reduce(applyCartSelectionMutation, action.selections) };
  }
  if (action.type === 'restore') {
    // A cancelled Strict Mode effect must never replay a second restoration.
    if (state.restored) return state;
    const baseSelections = action.items === null
      ? action.selections
      : normalizeCartSelections(action.items);
    const savedSelections = state.pendingMutations.reduce(applyCartSelectionMutation, baseSelections);
    const restored = action.items === null
      ? state
      : state.pendingMutations.reduce(applyFashionCartAction, { ...state, cart: action.items });
    return {
      ...restored,
      // Restoration is silent: retain only feedback from actual user interactions.
      lastAddedItem: state.lastAddedItem,
      additionSequence: state.additionSequence,
      savedSelections,
      restored: true,
      pendingMutations: [],
    };
  }
  const next = applyFashionCartAction(state, action);
  if (action.type === 'clearFeedback') return next;
  return {
    ...next,
    savedSelections: state.savedSelections === null
      ? null
      : applyCartSelectionMutation(state.savedSelections, action),
    pendingMutations: !state.restored
      ? [...state.pendingMutations, action]
      : [],
  };
}

export function FashionCartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(fashionCartReducer, {
    cart: [],
    lastAddedItem: null,
    additionSequence: 0,
    savedSelections: null,
    restored: false,
    pendingMutations: [],
  });
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let selections: CartSelection[] = [];
    try {
      selections = readCartSelections(window.localStorage);
    } catch {
      // Accessing localStorage itself can throw in restricted browsers.
    }
    // Persist user edits immediately even while canonical prices are loading.
    dispatch({ type: 'readSelections', selections });
    if (selections.length === 0) {
      dispatch({ type: 'restore', items: [], selections });
      return () => controller.abort();
    }
    const timeout = setTimeout(() => controller.abort(), 10000);
    void (async () => {
      try {
        const response = await fetch('/api/storefront/products', {
          cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) throw new Error('Storefront unavailable');
        const items = restoreCanonicalCart(selections, await response.json());
        if (!cancelled) dispatch({ type: 'restore', items, selections });
      } catch {
        // Do not display unverified prices or erase saved selections during outages.
        if (!cancelled) dispatch({ type: 'restore', items: null, selections });
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    // Never overwrite saved items with the initial empty render.
    if (state.savedSelections === null) return;
    try {
      writeCartSelections(window.localStorage, state.savedSelections);
    } catch {
      // The cart remains usable when persistence is unavailable.
    }
  }, [state.savedSelections]);


  useEffect(
    () => () => {
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }
    },
    [],
  );

  const addToCart = useCallback((item: FashionCartItem) => {
    trackStorefrontEvent({
      type: 'add_to_cart',
      target: item.id,
      detail: `${item.name}${item.selectedSize ? ` (${item.selectedSize})` : ''}`,
    });
    dispatch({ type: 'add', item });
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
    }
    feedbackTimeoutRef.current = setTimeout(() => {
      dispatch({ type: 'clearFeedback' });
      feedbackTimeoutRef.current = null;
    }, CART_FEEDBACK_DURATION_MS);
  }, []);

  const removeFromCart = useCallback((id: string, selectedSize?: string | null) => {
    dispatch({ type: 'remove', id, selectedSize });
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number, selectedSize?: string | null) => {
    dispatch({ type: 'updateQuantity', id, quantity, selectedSize });
  }, []);

  const clearCart = useCallback(() => {
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = null;
    }
    dispatch({ type: 'clear' });
  }, []);

  const value = useMemo(
    () => ({
      cart: state.cart,
      lastAddedItem: state.lastAddedItem,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
    }),
    [addToCart, clearCart, removeFromCart, state.cart, state.lastAddedItem, updateQuantity],
  );

  return (
    <FashionCartContext.Provider value={value}>{children}</FashionCartContext.Provider>
  );
}

export function useFashionCart() {
  const context = useContext(FashionCartContext);
  if (context === undefined) {
    throw new Error('useFashionCart must be used within a FashionCartProvider');
  }
  return context;
}

