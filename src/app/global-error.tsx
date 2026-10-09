'use client';

/**
 * The backstop for a throw in the root layout itself, where the normal error
 * boundary has no shell left to render into — so this one ships its own
 * <html> and its own styles rather than relying on anything above it. The
 * colours are the design system's, read from its JS so no stylesheet is needed.
 */
import { color } from '../ds/tokens.js';

const c = color.dark;

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en-GB">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: c.surface.ground,
          color: c.ink.primary,
          font: '14px/1.5 ui-sans-serif, system-ui, sans-serif',
        }}
      >
        <main style={{ maxWidth: '40ch', padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Pixel Map Maker could not start</h1>
          <p style={{ color: c.ink.secondary, margin: '0 0 16px' }}>
            Any project saved in this browser is untouched and will load once the page does.
          </p>
          <button
            type="button"
            onClick={retry}
            style={{
              font: 'inherit', fontWeight: 600, cursor: 'pointer',
              padding: '8px 16px', borderRadius: 6,
              border: 0, background: c.accent.default, color: c.accent.on,
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p style={{ color: c.ink.tertiary, fontSize: 12, marginTop: 16 }}>Reference: {error.digest}</p>
          )}
        </main>
      </body>
    </html>
  );
}
