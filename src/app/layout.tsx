import type { Metadata } from "next";
import "../styles/index.css";
import { AuthProvider } from "@/app/context/AuthContext";
import { VisitTracker } from "@/app/components/system/VisitTracker";

export const metadata: Metadata = {
  title: "ENICO VECK",
  description: "Subculture fashion storefront experience",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://pub-11768089b4c8464da58cf12287bef2fa.r2.dev" crossOrigin="" />
        <link rel="preconnect" href="https://images.unsplash.com" crossOrigin="" />
        <link rel="dns-prefetch" href="https://pub-11768089b4c8464da58cf12287bef2fa.r2.dev" />
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
      </head>
      <body>
        <AuthProvider>
          <VisitTracker />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
