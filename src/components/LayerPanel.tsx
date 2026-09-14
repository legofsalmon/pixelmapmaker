'use client';

import { useEditor } from '@/state/store';
import { layerRect } from '@/lib/geometry';

export default function LayerPanel() {
  const layers = useEditor((s) => s.layers);
  const selectedIds = useEditor((s) => s.selectedIds);
  const setSelection = useEditor((s) => s.setSelection);
  const toggleSelection = useEditor((s) => s.toggleSelection);
  const updateLayer = useEditor((s) => s.updateLayer);
  const removeLayer = useEditor((s) => s.removeLayer);
  const duplicateLayer = useEditor((s) => s.duplicateLayer);
  const reorderLayer = useEditor((s) => s.reorderLayer);
  const selectAll = useEditor((s) => s.selectAll);
  const commit = useEditor((s) => s.commit);

  return (
    <section className="panel">
      <header className="panel__head">
        <h2>Screens</h2>
        <span className="panel__count">
          {selectedIds.length ? `${selectedIds.length} of ${layers.length} selected` : layers.length}
        </span>
      </header>
      <div className="panel__body">
        {layers.length > 1 && (
          <div className="btn-row">
            <button className="btn btn--ghost" type="button" onClick={selectAll}>Select all</button>
            <button
              className="btn btn--ghost"
              type="button"
              disabled={!selectedIds.length}
              onClick={() => setSelection([])}
            >
              Deselect
            </button>
            <span className="note">Shift-click to add · ⌘/Ctrl+A all</span>
          </div>
        )}
        <ul className="layer-list">
          {/* Topmost first, matching what is drawn on top. */}
          {[...layers].reverse().map((layer) => {
            const rect = layerRect(layer);
            const selected = selectedIds.includes(layer.id);
            return (
              <li key={layer.id} className={`layer${selected ? ' is-selected' : ''}`}>
                <span className="layer__swatch" style={{ background: layer.color }} aria-hidden />
                <button
                  className="layer__main"
                  type="button"
                  onClick={(e) => (e.shiftKey ? toggleSelection(layer.id) : setSelection([layer.id]))}
                >
                  <strong>{layer.name}</strong>
                  <span>
                    {layer.cols} × {layer.rows} cabinets · {rect.width} × {rect.height} px
                  </span>
                </button>
                <div className="layer__actions">
                  <button
                    type="button"
                    title={layer.visible ? 'Hide' : 'Show'}
                    aria-label={layer.visible ? 'Hide screen' : 'Show screen'}
                    onClick={() => updateLayer(layer.id, { visible: !layer.visible })}
                  >
                    {layer.visible ? '👁' : '🚫'}
                  </button>
                  <button
                    type="button"
                    title={layer.locked ? 'Unlock' : 'Lock'}
                    aria-label={layer.locked ? 'Unlock screen' : 'Lock screen'}
                    onClick={() => updateLayer(layer.id, { locked: !layer.locked })}
                  >
                    {layer.locked ? '🔒' : '🔓'}
                  </button>
                  <button type="button" title="Bring forward" aria-label="Bring forward" onClick={() => reorderLayer(layer.id, 'up')}>↑</button>
                  <button type="button" title="Send backward" aria-label="Send backward" onClick={() => reorderLayer(layer.id, 'down')}>↓</button>
                  <button type="button" title="Duplicate" aria-label="Duplicate screen" onClick={() => duplicateLayer(layer.id)}>⧉</button>
                  <button
                    type="button"
                    title="Delete"
                    aria-label="Delete screen"
                    onClick={() => {
                      commit();
                      removeLayer(layer.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
              </li>
            );
          })}
          {!layers.length && <li className="empty">Add a cabinet from the library to start.</li>}
        </ul>
      </div>
    </section>
  );
}
