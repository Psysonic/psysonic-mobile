import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { useLiveSearchScopeStore, useScopedBrowseSearchQuery } from '@/store/liveSearchScopeStore';
import FavoritesFilterField from '@/features/favorites/components/FavoritesFilterField';

function ScopedQuery() {
  return <output>{useScopedBrowseSearchQuery('favorites')}</output>;
}

describe('FavoritesFilterField (touch shell)', () => {
  beforeEach(() => {
    resetAllStores();
    useLiveSearchScopeStore.setState({ query: '', scope: 'favorites', undoStack: [] });
  });

  it('typing filters the favorites page through the scoped query', () => {
    renderWithProviders(<><FavoritesFilterField /><ScopedQuery /></>);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'blue' } });
    expect(useLiveSearchScopeStore.getState().query).toBe('blue');
    expect(screen.getByRole('status')).toHaveTextContent('blue');
  });
});
