import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pixel Map Maker — LED wall pixel maps and cabinet calculator',
  description:
    'Design LED video wall pixel maps from a library of real cabinets. Drag screens on a canvas, work out size, weight and power, then export PNG grids for Resolume, Millumin and After Effects.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#05070b',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
