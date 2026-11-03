'use client';

import type { ComponentProps, ReactNode } from 'react';
import { SkulletProvider } from 'skullet/react';
import 'skullet/styles.css';

type ThemeProp = ComponentProps<typeof SkulletProvider>['theme'];

const STOREFRONT_LIGHT_THEME: ThemeProp = {
  animation: 'shimmer',
  radius: '4px',
  light: {
    base: 'rgba(17, 24, 39, 0.085)',
    highlight: 'rgba(255, 255, 255, 0.88)',
  },
  dark: {
    base: 'rgba(236, 240, 245, 0.12)',
    highlight: 'rgba(0, 255, 209, 0.24)',
  },
};

const STOREFRONT_DARK_THEME: ThemeProp = {
  animation: 'shimmer',
  radius: '6px',
  dark: {
    base: 'rgba(236, 240, 245, 0.11)',
    highlight: 'rgba(0, 255, 209, 0.22)',
  },
};

export function StorefrontSkulletProvider({ children }: { children: ReactNode }) {
  return (
    <SkulletProvider mode="light" reveal="sweep" theme={STOREFRONT_LIGHT_THEME}>
      {children}
    </SkulletProvider>
  );
}

export function DarkSkulletBoundary({ children }: { children: ReactNode }) {
  return (
    <SkulletProvider mode="dark" reveal="sweep" theme={STOREFRONT_DARK_THEME}>
      {children}
    </SkulletProvider>
  );
}
