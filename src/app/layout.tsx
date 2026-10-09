import type { Metadata, Viewport } from 'next';
import '../ds/tokens.css';
import './globals.css';
import { color } from '../ds/tokens.js';

export const metadata: Metadata = {
  title: 'Pixel Map Maker — LED wall pixel maps and cabinet calculator',
  description:
    'Design LED video wall pixel maps from a library of real cabinets. Drag screens on a canvas, work out size, weight and power, then export PNG grids for Resolume, Millumin and After Effects.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: color.dark.surface.ground,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Dark only until a light theme has been tried on the verify job's phone
    // screens (docs/adoption.md in the design-system repo).
    <html lang="en-GB" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
