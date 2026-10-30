'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import CabinetLibrary from './CabinetLibrary';
import CanvasStage from './CanvasStage';
import Inspector from './Inspector';
import LayerPanel from './LayerPanel';
import EffectsPanel from './EffectsPanel';
import PickList from './PickList';
import StatusBar from './StatusBar';
import Icon from './Icon';
import MultiSelectPanel from './MultiSelectPanel';
import SaveDialog from './SaveDialog';
import SpecSheet from './SpecSheet';
import SupportPanel from './SupportPanel';
import Toolbar from './Toolbar';
import { persistProject, restoreProject, useEditor } from '@/state/store';
import { isAnySurfaceOpen, isTypingTarget } from '@/lib/surfaces';

/*
 * three.js is most of a megabyte, and most sessions never turn a wall round.
 * Loaded when the 3D view is first opened, so the editor itself starts as
 * fast as it did before the view existed.
 */
const Viewer3D = dynamic(() => import('./Viewer3D'), {
  ssr: false,
  loading: () => (
    <div className="modal" role="status">
      <p className="modal__panel modal__panel--narrow viewer3d__loading">Loading the 3D view…</p>
    </div>
  ),
});

export default function Editor() {
  const [showSpecSheet, setShowSpecSheet] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [showPickList, setShowPickList] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [showEffects, setShowEffects] = useState(false);
  const [show3d, setShow3d] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'library' | 'canvas' | 'screen'>('canvas');
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const selectedCount = useEditor((s) => s.selectedIds.length);
  const selectAll = useEditor((s) => s.selectAll);
  const duplicateSelection = useEditor((s) => s.duplicateSelection);
  const removeSelection = useEditor((s) => s.removeSelection);
  const storageError = useEditor((s) => s.storageError);

  useEffect(() => {
    void restoreProject();
  }, []);

  // Save on every change, coalesced so typing does not thrash localStorage.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const unsubscribe = useEditor.subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(() => void persistProject(), 400);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // One question, one answer — Editor and CanvasStage used to keep two
      // copies of this test and they disagreed about <select>.
      if (isTypingTarget(e.target)) return;
      // Any open surface owns the keyboard, including the docked panel: its
      // own controls must not have Delete reach the canvas behind them.
      if (isAnySurfaceOpen()) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && key === 'a') {
        e.preventDefault();
        selectAll();
        return;
      }
      if (mod && key === 'd') {
        e.preventDefault();
        duplicateSelection();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        /*
         * While a chain is being drawn, backspace takes the last cabinet off
         * it — the canvas owns the key, and deleting the screen out from
         * under the chain being drawn on it is never what was meant.
         */
        if ((useEditor.getState().cablingDraw?.index ?? -1) >= 0) return;
        e.preventDefault();
        removeSelection();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, selectAll, duplicateSelection, removeSelection]);

  return (
    <div className="app">
      {/* The library can render hundreds of rows between the toolbar and the
          canvas, so a keyboard user needs a way past it. */}
      <a className="skip-link" href="#canvas">Skip to the canvas</a>
      <Toolbar
        onShowSpecSheet={() => setShowSpecSheet(true)}
        onShowSave={() => setShowSave(true)}
        onShowPickList={() => setShowPickList(true)}
        onShowSupport={() => setShowSupport(true)}
        onShowEffects={() => setShowEffects(true)}
        onShow3d={() => setShow3d(true)}
      />

      <nav className="mobile-tabs no-print" aria-label="Panels">
        {(['library', 'canvas', 'screen'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            aria-current={mobilePanel === tab}
            onClick={() => setMobilePanel(tab)}
          >
            {tab === 'library' ? 'Library' : tab === 'canvas' ? 'Canvas' : 'Screen'}
          </button>
        ))}
      </nav>

      {storageError && (
        /*
          App level, above everything, and not dismissible. A panel could be
          closed and a toast would time out; this says the work is not being
          kept, which stays true until it is fixed.
        */
        <p className="banner banner--danger" role="alert">
          <Icon name="error" size={16} />
          <span>{storageError}</span>
        </p>
      )}

      <main className="app__body" data-mobile-panel={mobilePanel}>
        <aside className="app__rail app__rail--left" aria-label="Cabinet library">
          <CabinetLibrary />
        </aside>

        <div className="app__centre" id="canvas">
          <div className="app__stage">
            <CanvasStage />
          </div>
          <StatusBar />
        </div>

        <aside className="app__rail app__rail--right" aria-label="Screens">
          {selectedCount > 1 ? <MultiSelectPanel /> : <Inspector />}
          <LayerPanel />
        </aside>
      </main>

      {showSpecSheet && <SpecSheet onClose={() => setShowSpecSheet(false)} />}
      {showSave && <SaveDialog onClose={() => setShowSave(false)} />}
      {showPickList && <PickList onClose={() => setShowPickList(false)} />}
      {showSupport && <SupportPanel onClose={() => setShowSupport(false)} />}
      {showEffects && <EffectsPanel onClose={() => setShowEffects(false)} />}
      {show3d && <Viewer3D onClose={() => setShow3d(false)} />}
    </div>
  );
}
