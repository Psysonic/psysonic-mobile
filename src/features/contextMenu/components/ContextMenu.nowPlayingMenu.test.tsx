/**
 * The touch player's "…" menu is about the track that is already playing, so it
 * opens with `nowPlayingMenu`: Play now / Play next / Add to queue, the Orbit add
 * and Favorite (the player has its own heart) are left out. Every other caller
 * (all desktop menus) leaves the flag unset and keeps them.
 */
import { act, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/orbit/utils/orbitBulkGuard', () => ({
  orbitBulkGuard: vi.fn(async () => true),
}));
vi.mock('@/features/offline/hooks/useOfflineBrowseContext', () => ({
  useOfflineBrowseContext: () => ({
    active: false,
    serverId: 'srv-1',
    capabilities: { localLibrary: false, favorites: false, playlists: false, manualPins: false, playerStats: false },
    hasBrowseCapability: false,
    hasBrowsingContent: false,
    connStatus: 'connected' as const,
  }),
}));

import ContextMenu from '@/features/contextMenu/components/ContextMenu';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import { useOrbitStore } from '@/features/orbit';
import { resetAllStores } from '@/test/helpers/storeReset';
import { makeTrack } from '@/test/helpers/factories';

const LEFT_OUT = ['Play Now', 'Play Next', 'Add to Queue', 'Favorite', 'Add to Orbit session', 'Go to Artist'];

function openSongMenu(nowPlayingMenu?: boolean) {
  act(() => {
    usePlayerStore.getState().openContextMenu(
      10, 10, makeTrack({ artistId: 'artist-1' }), 'song', undefined, undefined, undefined, undefined, true, undefined, undefined, true, nowPlayingMenu,
    );
  });
}

describe('song menu for the playing track', () => {
  beforeEach(() => {
    resetAllStores();
    useOrbitStore.setState({ role: 'host' });
  });

  it('keeps every entry without the flag', () => {
    renderWithProviders(<ContextMenu />);
    openSongMenu();
    for (const label of LEFT_OUT) expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('leaves out what the player already offers or would queue the track again', () => {
    renderWithProviders(<ContextMenu />);
    openSongMenu(true);
    for (const label of LEFT_OUT) expect(screen.queryByText(label)).toBeNull();
    expect(screen.getByText('Add to Playlist')).toBeInTheDocument();
    expect(screen.getByText('Song Info')).toBeInTheDocument();
  });
});
