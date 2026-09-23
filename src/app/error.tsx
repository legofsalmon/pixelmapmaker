'use client';

import { useEffect } from 'react';

/**
 * What the user sees when a render throws.
 *
 * There was no error boundary at all, so a crash fell through to Next's
 * generic page: correct, and useless to someone who has just spent an hour
 * laying out a wall. The two things they need to know are whether the work
 * survived and what to press. Both are here.
 *
 * Next 16 passes `retry`, not the `reset` of earlier versions — it re-renders
 * the segment, which is enough for a transient fault and harmless otherwise.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error('Pixel Map Maker crashed:', error);
  }, [error]);

  const discard = () => {
    try {
      window.localStorage.removeItem('pixelmapmaker.project.v1');
    } catch {
      // Nothing to clear if storage is unavailable; the reload still helps.
    }
    window.location.reload();
  };

  return (
    <main className="crash">
      <h1>Something broke</h1>
      <p>
        Your saved project is still in this browser and reloading will usually bring it
        back. If the crash keeps happening, that saved copy is most likely the cause of
        it — discarding it gives you an empty canvas instead of a loop.
      </p>
      <div className="btn-row">
        <button className="btn btn--primary" type="button" onClick={retry}>
          Try again
        </button>
        <button className="btn btn--secondary" type="button" onClick={() => window.location.reload()}>
          Reload the page
        </button>
        {/*
          The escape hatch. Without it a project that crashes on load cannot be
          got rid of from inside the app: every route back in reloads the thing
          that crashed. Named for what it costs, and it never touches the named
          saves or anything already exported to a file.
        */}
        <button className="btn btn--danger" type="button" onClick={discard}>
          Discard the saved project
        </button>
      </div>
      {error.digest && <p className="note">Reference: {error.digest}</p>}
    </main>
  );
}
