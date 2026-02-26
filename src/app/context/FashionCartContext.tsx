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

export function FashionCartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<FashionCartItem[]>([]);

  const addToCart = (item: FashionCartItem) => {
    setCart((prevCart) => {
      const existingItem = prevCart.find((i) => i.id === item.id);
      
      if (existingItem) {
        return prevCart.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + item.quantity } : i
        );
      } else {
        return [...prevCart, item];
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
          item.id === id ? { ...item, quantity } : item
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
