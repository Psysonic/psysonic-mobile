import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ChevronsRight, Heart, Info, ListPlus, MoreHorizontal, Play, Radio, Trash2, User, type LucideIcon } from 'lucide-react';
import { usePlayerStore, resolveQueueTrack } from '@/features/playback';
import { ownedOverrideValue } from '@/lib/util/ownedEntityKey';
import {
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
  queue: ListPlus,
  artist: User,
  play: Play,
  select: CheckCircle2,
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
  const { target } = ring;
  const ref = usePlayerStore(s => (target.kind === 'queue' ? s.queueItems[target.idx] : undefined));
  const starredOverrides = usePlayerStore(s => s.starredOverrides);
  const track = target.kind === 'track' ? target.track : (ref ? resolveQueueTrack(ref) : null);
  const likes = target.kind === 'album' ? target.album : track;
  const liveStarred = likes ? (ownedOverrideValue(starredOverrides, likes) ?? !!likes.starred) : false;
  const isAlbum = target.kind === 'album';
  // While the picked piece lingers its action has already run: keep showing what was picked.
  const [starred, setStarred] = useState(liveStarred);
  if (!ring.leaving && starred !== liveStarred) setStarred(liveStarred);

  const labels: Record<QueueRingAction | 'menu', string> = {
    next: t('contextMenu.playNext'),
    like: isAlbum
      ? t(starred ? 'contextMenu.unfavoriteAlbum' : 'contextMenu.favoriteAlbum')
      : t(starred ? 'contextMenu.unfavorite' : 'contextMenu.favorite'),
    info: t('contextMenu.songInfo'),
    radio: t('contextMenu.startRadio'),
    remove: t(target.kind === 'track' ? 'contextMenu.removeFromPlaylist' : 'contextMenu.removeFromQueue'),
    queue: t(isAlbum ? 'contextMenu.enqueueAlbum' : 'contextMenu.addToQueue'),
    artist: t('contextMenu.goToArtist'),
    play: t('contextMenu.playNow'),
    select: t('playlists.select'),
    menu: t('player.moreOptions'),
  };
  const { x, y, pick, actions, leaving } = ring;
  const count = actions.length;

  return createPortal(
    <div className={`queue-ring${leaving ? ' queue-ring--leaving' : ''}`} aria-hidden="true">
      <svg className="queue-ring__svg" width="100%" height="100%">
        {actions.map((action, i) => (
          <path
            key={action}
            d={queueRingSlicePath(i, x, y, count)}
            className={`queue-ring__slice${pick === action ? ' is-active' : ''}`}
          />
        ))}
      </svg>
      {actions.map((action, i) => {
        const Icon = ICONS[action];
        const at = queueRingIconPoint(i, x, y, count);
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
