/** The ring's "Select" starts a multi-selection; while it runs a tap picks rows instead of playing. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { makeSubsonicSong } from '@/test/helpers/factories';
import { songToTrack } from '@/lib/media/songToTrack';
import MobileSongRow from './MobileSongRow';
import { useMobileSelectionStore } from '../store/mobileSelectionStore';

const songs = [
  makeSubsonicSong({ id: 's1', title: 'One', serverId: 'srv' }),
  makeSubsonicSong({ id: 's2', title: 'Two', serverId: 'srv' }),
];

function setup() {
  const onPlay = vi.fn();
  const onMore = vi.fn();
  renderWithProviders(
    <>
      {songs.map((song, i) => (
        <MobileSongRow key={song.id} song={song} index={i} isActive={false} showEq={false} onPlay={onPlay} onMore={onMore} />
      ))}
    </>,
  );
  const row = (title: string) => screen.getAllByRole('button', { name: new RegExp(title) }).find(b => !b.hasAttribute('aria-haspopup'))!;
  return { onPlay, onMore, row };
}

const selectedIds = () => useMobileSelectionStore.getState().selected.map(t => t.id);
const startSelection = () => act(() => useMobileSelectionStore.getState().start(songToTrack(songs[0])));

describe('MobileSongRow selection', () => {
  beforeEach(() => useMobileSelectionStore.getState().clear());

  it('a long press (contextmenu) asks for the menu, which the shell turns into the ring', () => {
    const { onPlay, onMore, row } = setup();
    fireEvent.contextMenu(row('One'), { clientX: 12, clientY: 34 });
    expect(onMore).toHaveBeenCalledWith(songs[0], { x: 12, y: 34 });
    expect(selectedIds()).toEqual([]);
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('marks its row as selectable for the ring', () => {
    const { row } = setup();
    expect(row('One').closest('[data-ring-select]')).not.toBeNull();
  });

  it('a long press during a selection adds the row', () => {
    const { onMore, row } = setup();
    startSelection();
    fireEvent.contextMenu(row('Two'));
    expect(selectedIds()).toEqual(['s1', 's2']);
    expect(onMore).not.toHaveBeenCalled();
    expect(row('One')).toHaveAttribute('aria-pressed', 'true');
  });

  it('while selecting, a tap adds or removes a row instead of playing', () => {
    const { onPlay, row } = setup();
    startSelection();
    fireEvent.click(row('Two'));
    expect(selectedIds()).toEqual(['s1', 's2']);
    fireEvent.click(row('One'));
    expect(selectedIds()).toEqual(['s2']);
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('removing the last row ends the selection, and a tap plays again', () => {
    const { onPlay, row } = setup();
    startSelection();
    fireEvent.click(row('One'));
    expect(selectedIds()).toEqual([]);
    fireEvent.click(row('Two'));
    expect(onPlay).toHaveBeenCalledWith(1);
  });
});
