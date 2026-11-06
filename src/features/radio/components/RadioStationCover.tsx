import { Radio } from 'lucide-react';
import type { InternetRadioStation } from '@/lib/api/subsonicTypes';
import { CoverArtImage } from '@/cover/CoverArtImage';
import { radioCoverRef } from '@/cover/ref';

/** Station logo for the touch list and sheet; a radio icon when the station has none. */
export default function RadioStationCover({ station, size }: { station: InternetRadioStation; size: number }) {
  if (!station.coverArt) return <Radio size={Math.round(size * 0.42)} strokeWidth={1.5} aria-hidden="true" />;
  return (
    <CoverArtImage
      coverRef={radioCoverRef(station)}
      displayCssPx={size}
      surface="dense"
      alt=""
      className="mobile-radio-cover__image"
    />
  );
}
