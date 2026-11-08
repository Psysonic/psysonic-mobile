import { NavLink } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Touch Mainstage: the favorites rail shows albums only. Without favorite albums it says
 * so, instead of vanishing and leaving a page that looks broken when it is the only rail.
 */
export default function StarredEmptyRail() {
  const { t } = useTranslation();
  return (
    <section className="album-row-section">
      <div className="album-row-header">
        <NavLink to="/favorites" className="section-title-link" style={{ marginBottom: 0 }}>
          {t('home.starred')}<ChevronRight size={18} className="section-title-chevron" />
        </NavLink>
      </div>
      <p className="empty-state" style={{ margin: 0 }}>{t('home.starredEmptyHint')}</p>
    </section>
  );
}
