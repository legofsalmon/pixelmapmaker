'use client';

/**
 * The backstop for a throw in the root layout itself, where the normal error
 * boundary has no shell left to render into — so this one ships its own
 * <html> and its own styles rather than relying on anything above it.
 */
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
          background: '#05070b',
          color: '#e9eef7',
          font: '14px/1.5 ui-sans-serif, system-ui, sans-serif',
        }}
      >
        <main style={{ maxWidth: '40ch', padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Pixel Map Maker could not start</h1>
          <p style={{ color: '#aab6c8', margin: '0 0 16px' }}>
            Any project saved in this browser is untouched and will load once the page does.
          </p>
          <button
            type="button"
            onClick={retry}
            style={{
              font: 'inherit', fontWeight: 600, cursor: 'pointer',
              padding: '8px 16px', borderRadius: 6,
              border: 0, background: '#38bdf8', color: '#04222e',
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p style={{ color: '#8d9bb0', fontSize: 12, marginTop: 16 }}>Reference: {error.digest}</p>
          )}
        </main>
      </body>
    </html>
  );
}
