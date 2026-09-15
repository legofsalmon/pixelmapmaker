'use client';

import Dialog from './Dialog';

/**
 * Replaces window.confirm, which UX.md rules out: it cannot be styled, ignores
 * the dark theme, and throws away the focus handling, Escape and naming that
 * Dialog already implements.
 */
export default function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog title={title} onClose={onCancel}>
      <div className="sheet__body">
        <p className="note">{body}</p>
        <div className="btn-row">
          <button
            className="btn btn--danger"
            type="button"
            onClick={() => {
              onConfirm();
              onCancel();
            }}
          >
            {confirmLabel}
          </button>
          <button className="btn btn--secondary" type="button" onClick={onCancel}>
            Keep what I have
          </button>
        </div>
      </div>
    </Dialog>
  );
}
