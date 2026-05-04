'use client';

import { useEffect, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { toast } from 'sonner';
import { MessageSquare, Plus, Send, Sparkles, Trash2 } from 'lucide-react';
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
    if (!text.trim()) return;
    const cid = await ensureConversation();
    if (!cid) return;

    await saveMessage({ conversationId: cid, role: 'user', content: text });
    sendMessage({ text });
    setInput('');
    inputRef.current?.focus();
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

  return (
    <div className="flex-1 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4 min-h-0">
      <aside className="hidden md:flex flex-col gap-2 overflow-y-auto">
        <Button
          onClick={handleNewConversation}
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
                onClick={() => loadConversation(c.id)}
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
      </aside>

      <Card className="flex flex-col overflow-hidden p-0">
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
              disabled={isLoading}
              className="flex-1 resize-none rounded-lg border border-slate-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
              style={{ unicodeBidi: 'plaintext' }}
            />
            <Button
              type="submit"
              disabled={!input.trim() || isLoading}
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
