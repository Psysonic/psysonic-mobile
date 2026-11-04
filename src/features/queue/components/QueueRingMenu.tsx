import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronsRight, Heart, Info, MoreHorizontal, Radio, Trash2, type LucideIcon } from 'lucide-react';
import { usePlayerStore, resolveQueueTrack } from '@/features/playback';
import { ownedOverrideValue } from '@/lib/util/ownedEntityKey';
import {
  QUEUE_RING_ACTIONS,
  RING_INNER_PX,
  RING_OUTER_PX,
  queueRingIconPoint,
  queueRingSlicePath,
  type QueueRingAction,
} from '@/features/queue/utils/queueRingGeometry';
import type { QueueRingState } from '@/features/queue/hooks/useQueueRowGestures';

const ICONS: Record<QueueRingAction, LucideIcon> = {
  next: ChevronsRight,
  like: Heart,
  info: Info,
  radio: Radio,
  remove: Trash2,
};

/** Gap between the label pill and the ring's top edge. */
const LABEL_GAP_PX = 14;

/**
 * The touch queue's ring menu, drawn around the held row (see
 * `useQueueRowGestures`). Only a picture of the gesture: the finger picks, the
 * label names the piece it points at. Screen readers keep the row's full menu.
 */
export function QueueRingMenu({ ring }: { ring: QueueRingState }) {
  const { t } = useTranslation();
  const ref = usePlayerStore(s => s.queueItems[ring.idx]);
  const starredOverrides = usePlayerStore(s => s.starredOverrides);
  const track = ref ? resolveQueueTrack(ref) : null;
  const starred = track ? (ownedOverrideValue(starredOverrides, track) ?? !!track.starred) : false;

  const labels: Record<QueueRingAction | 'menu', string> = {
    next: t('contextMenu.playNext'),
    like: starred ? t('contextMenu.unfavorite') : t('contextMenu.favorite'),
    info: t('contextMenu.songInfo'),
    radio: t('contextMenu.startRadio'),
    remove: t('contextMenu.removeFromQueue'),
    menu: t('player.moreOptions'),
  };
  const { x, y, pick } = ring;

  return createPortal(
    <div className="queue-ring" aria-hidden="true">
      <svg className="queue-ring__svg" width="100%" height="100%">
        {QUEUE_RING_ACTIONS.map((action, i) => (
          <path
            key={action}
            d={queueRingSlicePath(i, x, y)}
            className={`queue-ring__slice${pick === action ? ' is-active' : ''}`}
          />
        ))}
      </svg>
      {QUEUE_RING_ACTIONS.map((action, i) => {
        const Icon = ICONS[action];
        const at = queueRingIconPoint(i, x, y);
        return (
          <span
            key={action}
            className={`queue-ring__icon queue-ring__icon--${action}${pick === action ? ' is-active' : ''}`}
            style={{ left: at.x, top: at.y }}
          >
            <Icon size={22} fill={action === 'like' && starred ? 'currentColor' : 'none'} />
          </span>
        );
      })}
      <span
        className={`queue-ring__center${pick === 'menu' ? ' is-active' : ''}`}
        style={{ left: x, top: y, width: (RING_INNER_PX - 4) * 2, height: (RING_INNER_PX - 4) * 2 }}
      >
        <MoreHorizontal size={22} />
      </span>
      {pick && (
        <span className="queue-ring__label" style={{ left: x, top: y - RING_OUTER_PX - LABEL_GAP_PX }}>
          {labels[pick]}
        </span>
      )}
    </div>,
    document.body,
  );
}
