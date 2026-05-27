import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PlutusClub — India\'s Private Buying Club',
  description: 'Access negotiated prices across 60+ categories. Pay what corporations pay.',
  keywords: 'group buying, bulk deals, India, membership club, savings',
  openGraph: {
    title: 'PlutusClub',
    description: 'Pay what you deserve. Not what retailers charge.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head />
      <body>{children}</body>
    </html>
  );
}
