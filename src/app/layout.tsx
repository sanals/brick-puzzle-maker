import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Brick Puzzle Maker',
  description: 'Parametric Brick-Compatible Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen">
        {/* SVG Filter for Accessibility Simulation */}
        <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
          <defs>
            <filter id="deuteranopia">
              {/* Matrix approximating Deuteranopia */}
              <feColorMatrix
                type="matrix"
                values="0.625 0.375 0 0 0
                        0.7 0.3 0 0 0
                        0 0.3 0.7 0 0
                        0 0 0 1 0"
              />
            </filter>
          </defs>
        </svg>
        {children}
      </body>
    </html>
  );
}
