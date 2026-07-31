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
}

type FashionCartAction =
  | { type: 'add'; item: FashionCartItem }
  | { type: 'remove'; id: string; selectedSize?: string | null }
  | { type: 'updateQuantity'; id: string; quantity: number; selectedSize?: string | null }
  | { type: 'clear' }
  | { type: 'clearFeedback' };

export function getFashionCartItemKey(id: string, selectedSize?: string | null) {
  return `${id}::${selectedSize?.trim() || ''}`;
}

function fashionCartReducer(
  state: FashionCartState,
  action: FashionCartAction,
): FashionCartState {
  switch (action.type) {
    case 'add': {
      const nextItemKey = getFashionCartItemKey(action.item.id, action.item.selectedSize);
      const existingItem = state.cart.find(
        (cartItem) =>
          getFashionCartItemKey(cartItem.id, cartItem.selectedSize) === nextItemKey,
      );
      const normalizedQuantity = Math.min(
        MAX_CART_ITEM_QUANTITY,
        Math.max(1, action.item.quantity || 1),
      );

      if (existingItem) {
        return {
          ...state,
          cart: state.cart.map((item) =>
            getFashionCartItemKey(item.id, item.selectedSize) === nextItemKey
              ? {
                  ...item,
                  quantity: Math.min(MAX_CART_ITEM_QUANTITY, Math.max(1, item.quantity || 1)),
                }
              : item,
          ),
        };
      }

      const nextCart = [...state.cart, { ...action.item, quantity: normalizedQuantity }];
      const nextSequence = state.additionSequence + 1;

      return {
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
                quantity: Math.min(MAX_CART_ITEM_QUANTITY, Math.max(1, action.quantity)),
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

export function FashionCartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(fashionCartReducer, {
    cart: [],
    lastAddedItem: null,
    additionSequence: 0,
  });
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }
    },
    [],
  );

  const addToCart = useCallback((item: FashionCartItem) => {
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
