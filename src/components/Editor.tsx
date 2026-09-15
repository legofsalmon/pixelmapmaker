'use client';

import { useEffect, useState } from 'react';
import CabinetLibrary from './CabinetLibrary';
import CanvasStage from './CanvasStage';
import Inspector from './Inspector';
import LayerPanel from './LayerPanel';
import EffectsPanel from './EffectsPanel';
import PickList from './PickList';
import MultiSelectPanel from './MultiSelectPanel';
import SaveDialog from './SaveDialog';
import SpecSheet from './SpecSheet';
import SupportPanel from './SupportPanel';
import Toolbar from './Toolbar';
import { persistProject, restoreProject, useEditor } from '@/state/store';

export default function Editor() {
  const [showSpecSheet, setShowSpecSheet] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [showPickList, setShowPickList] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [showEffects, setShowEffects] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'library' | 'canvas' | 'screen'>('canvas');
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const selectedCount = useEditor((s) => s.selectedIds.length);
  const selectAll = useEditor((s) => s.selectAll);
  const duplicateSelection = useEditor((s) => s.duplicateSelection);
  const removeSelection = useEditor((s) => s.removeSelection);

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
        e.preventDefault();
        removeSelection();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, selectAll, duplicateSelection, removeSelection]);

  return (
    <div className="app">
      <Toolbar
        onShowSpecSheet={() => setShowSpecSheet(true)}
        onShowSave={() => setShowSave(true)}
        onShowPickList={() => setShowPickList(true)}
        onShowSupport={() => setShowSupport(true)}
        onShowEffects={() => setShowEffects(true)}
      />

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
          {selectedCount > 1 ? <MultiSelectPanel /> : <Inspector />}
          <LayerPanel />
        </aside>
      </main>

      {showSpecSheet && <SpecSheet onClose={() => setShowSpecSheet(false)} />}
      {showSave && <SaveDialog onClose={() => setShowSave(false)} />}
      {showPickList && <PickList onClose={() => setShowPickList(false)} />}
      {showSupport && <SupportPanel onClose={() => setShowSupport(false)} />}
      {showEffects && <EffectsPanel onClose={() => setShowEffects(false)} />}
    </div>
  );
}
