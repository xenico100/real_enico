import type { Metadata } from "next";
import "../styles/index.css";

export const metadata: Metadata = {
  title: "ANARCHE",
  description: "Subculture fashion storefront experience",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
