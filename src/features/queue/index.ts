// Public API of the queue feature (QueuePanel UI + its hooks). Consumes the
// playback store; holds no audio-engine state itself.
export { default } from './components/QueuePanel';
export { useQueueResizer } from './hooks/useQueueResizer';
export { useQueueTrackAt } from './hooks/useQueueTracks';
export { RING_EXIT_MS, type QueueRingState, type QueueRowTarget } from './hooks/useQueueRowGestures';
export {
  ALBUM_RING_ACTIONS,
  PLAYLIST_RING_ACTIONS,
  TRACK_RING_ACTIONS,
  queueRingCenter,
  queueRingPick,
  type QueueRingAction,
  type QueueRingPick,
} from './utils/queueRingGeometry';
export { useQueueTouchRowActions } from './hooks/useQueueTouchRowActions';
export { QueueRingMenu } from './components/QueueRingMenu';
export { QueueUndoBar } from './components/QueueUndoBar';
