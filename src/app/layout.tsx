import type { Metadata } from "next";
import "../styles/index.css";
import { AuthProvider } from "@/app/context/AuthContext";
import { VisitTracker } from "@/app/components/system/VisitTracker";

export const metadata: Metadata = {
  metadataBase: new URL("https://enicoveck.com"),
  title: {
    default: "에니코벡 | ENICO VECK",
    template: "%s | 에니코벡 ENICO VECK",
  },
  description: "에니코벡(ENICO VECK) 공식 온라인 스토어. 서브컬처 패션 브랜드, 아카이브 컬렉션 및 스트릿웨어.",
  keywords: ["에니코벡", "ENICO VECK", "enicoveck", "에니코백", "서브컬처", "스트릿웨어", "디자이너 브랜드", "패션"],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "에니코벡 | ENICO VECK",
    description: "에니코벡(ENICO VECK) 공식 온라인 스토어. 서브컬처 패션 브랜드.",
    url: "https://enicoveck.com",
    siteName: "에니코벡 (ENICO VECK)",
    locale: "ko_KR",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: "Fdxn8wTsJ3p7zLQJ7VZZo50c4Rc42GzGzKwXSbTtCvE",
  },
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
