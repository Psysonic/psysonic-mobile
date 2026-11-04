import { createPortal } from 'react-dom';
import type { TFunction } from 'i18next';
import type { QueueUndoNotice } from '@/features/queue/hooks/useQueueTouchRowActions';

/** Touch queue: what a quick action just did, with Undo for the queue edit. */
export function QueueUndoBar({ notice, onUndo, t }: { notice: QueueUndoNotice; onUndo: () => void; t: TFunction }) {
  return createPortal(
    <div className="queue-undo-bar" role="status">
      <span className="queue-undo-bar__text">{notice.text}</span>
      {notice.undoable && (
        <button type="button" className="queue-undo-bar__btn" onClick={onUndo}>
          {t('queue.touchUndo')}
        </button>
      )}
    </div>,
    document.body,
  );
}
