import { notFound } from 'next/navigation';
import { advisorEnabled } from '@/lib/features';
import { listConversations } from './actions';
import { ChatPanel } from './_components/chat-panel';
import { t } from '@/lib/i18n/he';

export default async function AdvisorPage() {
  if (!advisorEnabled()) notFound();

  const conversations = await listConversations();

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-bold">{t.advisor.title}</h1>
          <p className="text-slate-600 mt-1 text-sm">{t.advisor.subtitle}</p>
        </div>
      </div>

      <ChatPanel conversations={conversations} />
    </div>
  );
}
