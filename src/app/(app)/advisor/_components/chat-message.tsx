import { Sparkles, User } from 'lucide-react';
import type { UIMessage } from 'ai';

// Renders a single chat bubble. Hides empty messages (e.g. an assistant
// turn that was 100% tool calls with no narrative text).
export function ChatMessage({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';

  const text = (message.parts ?? [])
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');

  if (!text) return null;

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={
          'size-8 rounded-full flex items-center justify-center shrink-0 ' +
          (isUser
            ? 'bg-slate-200 text-slate-700'
            : 'bg-gradient-to-br from-blue-500 to-violet-500 text-white')
        }
      >
        {isUser ? <User className="size-4" /> : <Sparkles className="size-4" />}
      </div>
      <div
        className={`flex-1 min-w-0 ${isUser ? 'text-end' : 'text-start'}`}
        style={{ unicodeBidi: 'plaintext' }}
      >
        <div className="inline-block max-w-[85%] rounded-2xl bg-slate-100 px-4 py-2.5 text-sm whitespace-pre-wrap">
          <bdi>{text}</bdi>
        </div>
      </div>
    </div>
  );
}
