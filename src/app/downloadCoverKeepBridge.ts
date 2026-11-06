import { registerDownloadCoverKeeper } from '@/features/offline/utils/downloadCoverSeam';
import { keepCoversForDownload } from '@/features/offline/utils/offlineCoverKeep';

/**
 * App-layer seam: downloads store their album covers, so they show offline.
 * Registered once at module load via a side-effect import from `AppShell`; the
 * offline store only calls the seam, since the cover code reaches the player
 * store, which imports the offline store back.
 */
registerDownloadCoverKeeper(keepCoversForDownload);
