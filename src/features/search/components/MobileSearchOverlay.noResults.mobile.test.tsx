import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import MobileSearchOverlay from '@/features/search/components/MobileSearchOverlay';

vi.mock('@/features/search/hooks/useShareSearch', () => ({ useShareSearch: () => ({ shareMatch: null }) }));
vi.mock('@/features/search/hooks/useLiveSearchQuery', () => ({
  useLiveSearchQuery: ({ query, setResults }: { query: string; setResults: (r: unknown) => void }) => {
    useEffect(() => {
      setResults(query ? { artists: [], albums: [], songs: [] } : null);
    }, [query, setResults]);
  },
}));
vi.mock('@/cover/AlbumCoverArtImage', () => ({ AlbumCoverArtImage: () => null }));
vi.mock('@/cover/ArtistCoverArtImage', () => ({ ArtistCoverArtImage: () => null }));
vi.mock('@/cover/CoverArtImage', () => ({ CoverArtImage: () => null }));

describe('MobileSearchOverlay without hits', () => {
  beforeEach(() => { resetAllStores(); });

  it('shows the no-results line and nothing else', async () => {
    renderWithProviders(<MobileSearchOverlay onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sept' } });

    const noResults = await screen.findByText('No results for "sept"');
    const list = noResults.parentElement!;
    // An empty result once left a stray "0" next to this line.
    expect(list.textContent).toBe('No results for "sept"');
  });
});
