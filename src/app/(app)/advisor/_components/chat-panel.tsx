'use client';

import { useEffect, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { toast } from 'sonner';
import {
  MessageSquare,
  Menu,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  createConversation,
  deleteConversation,
  saveMessage,
} from '../actions';
import { ChatMessage } from './chat-message';
import { t } from '@/lib/i18n/he';

type Conversation = {
  id: string;
  title: string | null;
  lastMessageAt: Date;
};

type Props = {
  conversations: Conversation[];
};

const SUGGESTIONS = [
  t.advisor.suggestion1,
  t.advisor.suggestion2,
  t.advisor.suggestion3,
  t.advisor.suggestion4,
];

export function ChatPanel({ conversations }: Props) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  // Local guard for the gap between click and `isLoading` flipping true.
  // ensureConversation + saveMessage both await server actions before
  // sendMessage is finally called — without this, two fast clicks would
  // interleave two full submit chains and double the user's message.
  const [submitting, setSubmitting] = useState(false);
  // Mobile-only drawer state. The conversations sidebar is hidden by default
  // below md (no horizontal room for a 260px column on phones); a hamburger
  // toggles a slide-in overlay so the user still has access to history.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: '/api/advisor' }),
    onFinish: async ({ message }) => {
      if (!conversationId) return;
      const text = message.parts
        .filter(
          (p): p is { type: 'text'; text: string } => p.type === 'text',
        )
        .map((p) => p.text)
        .join('');
      if (text) {
        await saveMessage({
          conversationId,
          role: 'assistant',
          content: text,
        });
      }
    },
  });

  // Stick to the bottom on every new chunk
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function ensureConversation(): Promise<string | null> {
    if (conversationId) return conversationId;
    const r = await createConversation({});
    if (!r.ok || !r.id) {
      toast.error(r.error ?? t.advisor.errorGeneric);
      return null;
    }
    setConversationId(r.id);
    return r.id;
  }

  async function handleSubmit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || submitting || isLoading) return;
    setSubmitting(true);
    // Clear the input immediately so the button's `!input.trim()` rule
    // disables it on the very next render — defense-in-depth against rapid
    // double-clicks while the awaits below are in flight.
    setInput('');
    try {
      const cid = await ensureConversation();
      if (!cid) return;
      await saveMessage({
        conversationId: cid,
        role: 'user',
        content: trimmed,
      });
      sendMessage({ text: trimmed });
      inputRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  function handleNewConversation() {
    setConversationId(null);
    setMessages([]);
    setInput('');
  }

  async function handleDelete(id: string) {
    if (!confirm(t.advisor.deleteConversationConfirm)) return;
    const r = await deleteConversation(id);
    if (!r.ok) {
      toast.error(r.error ?? t.advisor.errorGeneric);
      return;
    }
    if (conversationId === id) handleNewConversation();
    toast.success(t.advisor.conversationDeleted);
  }

  async function loadConversation(id: string) {
    setConversationId(id);
    const r = await fetch(`/api/advisor/conversation/${id}`);
    if (!r.ok) {
      toast.error(t.advisor.loadConversationFailed);
      return;
    }
    const data = (await r.json()) as {
      messages: Array<{
        id: string;
        role: 'user' | 'assistant';
        content: string;
      }>;
    };
    setMessages(
      data.messages.map((m) => ({
        id: m.id,
        role: m.role,
        parts: [{ type: 'text', text: m.content }],
      })),
    );
  }

  const isLoading = status === 'submitted' || status === 'streaming';

  // Wrap loadConversation / handleNewConversation so they auto-close the
  // mobile drawer after the user picks something — saves an extra tap.
  function pickConversation(id: string) {
    void loadConversation(id);
    setSidebarOpen(false);
  }
  function startNewConversation() {
    handleNewConversation();
    setSidebarOpen(false);
  }

  const sidebarContent = (
    <>
      <Button
        onClick={startNewConversation}
        variant="outline"
        className="justify-start"
      >
        <Plus className="size-4" />
        {t.advisor.newConversation}
      </Button>
      <div className="text-xs text-slate-500 mt-2 mb-1">
        {t.advisor.conversations}
      </div>
      {conversations.length === 0 ? (
        <p className="text-xs text-slate-500 p-2">
          {t.advisor.noConversations}
        </p>
      ) : (
        conversations.map((c) => (
          <div key={c.id} className="group flex items-center gap-1">
            <button
              onClick={() => pickConversation(c.id)}
              className={
                'flex-1 flex items-start gap-2 p-2 rounded text-start text-sm ' +
                (conversationId === c.id
                  ? 'bg-violet-100 text-violet-900'
                  : 'hover:bg-slate-100')
              }
            >
              <MessageSquare className="size-4 shrink-0 mt-0.5" />
              <span
                className="truncate"
                style={{ unicodeBidi: 'plaintext' }}
              >
                <bdi>{c.title ?? t.advisor.untitledConversation}</bdi>
              </span>
            </button>
            <button
              onClick={() => handleDelete(c.id)}
              className="opacity-0 group-hover:opacity-100 p-1 text-rose-600 hover:bg-rose-50 rounded transition-opacity"
              aria-label={t.advisor.deleteConversation}
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))
      )}
    </>
  );

  return (
    <div className="flex-1 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4 min-h-0 relative">
      {/* Desktop sidebar — always visible at md+ */}
      <aside className="hidden md:flex flex-col gap-2 overflow-y-auto">
        {sidebarContent}
      </aside>

      {/* Mobile drawer — fixed overlay, slides in from the start side. The
          backdrop closes on click. Hidden at md+ since the desktop sidebar
          covers it. */}
      {sidebarOpen && (
        <>
          <button
            type="button"
            aria-label={t.common.close}
            onClick={() => setSidebarOpen(false)}
            className="md:hidden fixed inset-0 bg-black/40 z-40 cursor-default"
          />
          <aside className="md:hidden fixed inset-y-0 start-0 z-50 w-72 max-w-[85vw] bg-white shadow-xl p-3 flex flex-col gap-2 overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-sm">
                {t.advisor.conversations}
              </span>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                aria-label={t.common.close}
                className="size-7 inline-flex items-center justify-center rounded text-slate-500 hover:bg-slate-100"
              >
                <X className="size-4" />
              </button>
            </div>
            {sidebarContent}
          </aside>
        </>
      )}

      <Card className="flex flex-col overflow-hidden p-0">
        {/* Mobile-only header bar: hamburger to open the conversations
            drawer. Hidden at md+ since the sidebar is permanent there. */}
        <div className="md:hidden flex items-center gap-2 p-2 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label={t.advisor.conversations}
            className="size-8 inline-flex items-center justify-center rounded text-slate-700 hover:bg-slate-100"
          >
            <Menu className="size-5" />
          </button>
          <span className="text-sm font-medium text-slate-700 truncate">
            {t.advisor.conversations}
          </span>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-4"
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <div className="size-12 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center mb-4">
                <Sparkles className="size-6 text-white" />
              </div>
              <h2 className="text-xl font-semibold mb-2">
                {t.advisor.emptyState}
              </h2>
              <p className="text-sm text-slate-600 mb-6">
                {t.advisor.suggestionsTitle}
              </p>
              <div className="grid gap-2 w-full max-w-md">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSubmit(s)}
                    className="text-start p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors text-sm"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => <ChatMessage key={m.id} message={m} />)
          )}
          {isLoading &&
            messages[messages.length - 1]?.role === 'user' && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Sparkles className="size-4 animate-pulse" />
                {t.advisor.thinking}
              </div>
            )}
          {error && (
            <div className="text-sm text-rose-600 p-3 bg-rose-50 rounded-lg space-y-1">
              <div className="font-medium">{t.advisor.errorGeneric}</div>
              {error.message && (
                <div className="text-xs opacity-80 font-mono break-words">
                  {error.message}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-slate-200">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit(input);
            }}
            className="flex gap-2"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(input);
                }
              }}
              placeholder={t.advisor.placeholder}
              rows={1}
              disabled={isLoading || submitting}
              className="flex-1 resize-none rounded-lg border border-slate-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
              style={{ unicodeBidi: 'plaintext' }}
            />
            <Button
              type="submit"
              disabled={!input.trim() || isLoading || submitting}
              className="bg-violet-600 text-white hover:bg-violet-700"
            >
              <Send className="size-4" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
