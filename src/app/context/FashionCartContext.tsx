'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

export interface FashionCartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  category?: string;
  selectedSize?: string | null;
}

interface FashionCartContextType {
  cart: FashionCartItem[];
  addToCart: (item: FashionCartItem) => void;
  removeFromCart: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
}

const FashionCartContext = createContext<FashionCartContextType | undefined>(undefined);
const MAX_CART_ITEM_QUANTITY = 1;

export function FashionCartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<FashionCartItem[]>([]);

  const addToCart = (item: FashionCartItem) => {
    setCart((prevCart) => {
      const existingItem = prevCart.find((i) => i.id === item.id);
      const normalizedQuantity = Math.min(
        MAX_CART_ITEM_QUANTITY,
        Math.max(1, item.quantity || 1),
      );

      if (existingItem) {
        return prevCart.map((i) =>
          i.id === item.id
            ? {
                ...i,
                quantity: Math.min(MAX_CART_ITEM_QUANTITY, Math.max(1, i.quantity || 1)),
              }
            : i,
        );
      } else {
        return [...prevCart, { ...item, quantity: normalizedQuantity }];
      }
    });
  };

  const removeFromCart = (id: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.id !== id));
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(id);
    } else {
      setCart((prevCart) =>
        prevCart.map((item) =>
          item.id === id
            ? {
                ...item,
                quantity: Math.min(MAX_CART_ITEM_QUANTITY, Math.max(1, quantity)),
              }
            : item,
        )
      );
    }
  };

  const clearCart = () => {
    setCart([]);
  };

  return (
    <FashionCartContext.Provider
      value={{
        cart,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
      }}
    >
      {children}
    </FashionCartContext.Provider>
  );
}

export function useFashionCart() {
  const context = useContext(FashionCartContext);
  if (context === undefined) {
    throw new Error('useFashionCart must be used within a FashionCartProvider');
  }
  return context;
}
