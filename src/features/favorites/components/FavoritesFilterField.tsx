import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLiveSearchScopeStore } from '@/store/liveSearchScopeStore';

/**
 * Touch: filters this page, as the desktop's search field does on it. The touch
 * shell's search covers the whole page and always searches everything.
 */
export default function FavoritesFilterField() {
  const { t } = useTranslation();
  const query = useLiveSearchScopeStore(s => s.query);
  const setQuery = useLiveSearchScopeStore(s => s.setQuery);
  const placeholder = t('search.scopeFavoritesPlaceholder');
  return (
    <div className="mobile-favorites__filter">
      <Search size={16} className="mobile-favorites__filter-icon" aria-hidden="true" />
      <input
        type="search"
        className="input-search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
      />
    </div>
  );
}
