import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Midnight Grid — Harbor Heat",
  description:
    "An original top-down open-city action game. Steal a ride, secure the package, lose the heat, and own the night.",
  applicationName: "Midnight Grid",
  keywords: ["browser game", "driving game", "open city", "arcade game"],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#080b0e",
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
