import { listCards } from './actions';
import { CardsManager } from './_components/cards-manager';
import { t } from '@/lib/i18n/he';

export default async function CardsSettingsPage() {
  const cards = await listCards();
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold">{t.cards.title}</h1>
        <p className="text-slate-600 mt-1">{t.cards.subtitle}</p>
      </div>
      <CardsManager initialCards={cards} />
    </div>
  );
}
