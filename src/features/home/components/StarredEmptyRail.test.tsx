import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import StarredEmptyRail from '@/features/home/components/StarredEmptyRail';

describe('StarredEmptyRail', () => {
  it('keeps the rail visible with a hint and a way to the favorites page', () => {
    renderWithProviders(<StarredEmptyRail />);
    expect(screen.getByText('Albums you mark as favorites appear here.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Personal Favorites/ })).toHaveAttribute('href', '/favorites');
  });
});
