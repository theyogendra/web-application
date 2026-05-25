import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import LayoutShell from "@/components/LayoutShell";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "InvoicePro — Invoicing & Payments",
  description: "Premium invoicing, quotations and payments platform.",
};

// Inline theme bootstrap — runs before React hydrates so users never see a
// light flash when their stored preference is dark.
const themeScript = `
(function() {
  try {
    var t = localStorage.getItem('ip_theme');
    if (!t) t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    if (t === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased">
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}
