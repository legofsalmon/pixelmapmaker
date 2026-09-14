'use client';

import { useEffect, useState } from 'react';
import CabinetLibrary from './CabinetLibrary';
import CanvasStage from './CanvasStage';
import Inspector from './Inspector';
import LayerPanel from './LayerPanel';
import SpecSheet from './SpecSheet';
import Toolbar from './Toolbar';
import { persistProject, restoreProject, useEditor } from '@/state/store';

export default function Editor() {
  const [showSpecSheet, setShowSpecSheet] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'library' | 'canvas' | 'screen'>('canvas');
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);

  useEffect(() => {
    restoreProject();
  }, []);

  // Save on every change, coalesced so typing does not thrash localStorage.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const unsubscribe = useEditor.subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(persistProject, 400);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      // Let text fields keep their own undo stack.
      if (el && (el.isContentEditable || el.tagName === 'TEXTAREA' ||
        (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'color'].includes((el as HTMLInputElement).type)))) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  return (
    <div className="app">
      <Toolbar onShowSpecSheet={() => setShowSpecSheet(true)} />

      <nav className="mobile-tabs no-print" aria-label="Panels">
        {(['library', 'canvas', 'screen'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={mobilePanel === tab ? 'is-active' : ''}
            onClick={() => setMobilePanel(tab)}
          >
            {tab === 'library' ? 'Library' : tab === 'canvas' ? 'Canvas' : 'Screen'}
          </button>
        ))}
      </nav>

      <main className="app__body" data-mobile-panel={mobilePanel}>
        <aside className="app__rail app__rail--left">
          <CabinetLibrary />
        </aside>

        <div className="app__centre">
          <CanvasStage />
        </div>

        <aside className="app__rail app__rail--right">
          <Inspector />
          <LayerPanel />
        </aside>
      </main>

      {showSpecSheet && <SpecSheet onClose={() => setShowSpecSheet(false)} />}
    </div>
  );
}
