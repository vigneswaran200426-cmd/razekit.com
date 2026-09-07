import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { fetchUserContext, resolveRouteContext } from '@/lib/support-context';
import {
  buildHelpPrompt, formatAnswer, pageContextFor, wantsEscalation, ROLE_SUGGESTIONS,
} from '@/lib/help-assistant';
import HelpQuestionInput from '@/components/help/HelpQuestionInput';
import SuggestedQuestions from '@/components/help/SuggestedQuestions';
import HelpConversation from '@/components/help/HelpConversation';
import ContactSupport from '@/components/help/ContactSupport';
import HelpRequestsList from '@/components/help/HelpRequestsList';

// The one Help surface: ask → answer → action, or ask → not resolved →
// contact support. No knowledge-base portal, no assistant branding.
export default function Help() {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [userContext, setUserContext] = useState('');
  const [routeContext, setRouteContext] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [escalation, setEscalation] = useState(null);
  const [view, setView] = useState('ask'); // ask | requests

  const fromRoute = location.state?.from || '';
  const page = useMemo(() => pageContextFor(fromRoute), [fromRoute]);
  const role = user?.user_role || 'visitor';

  useEffect(() => {
    base44.analytics.track({ eventName: 'help_opened' });
    base44.auth.me().then(async (u) => {
      setUser(u);
      if (!u?.id) return;
      const [uc, rc] = await Promise.all([
        fetchUserContext(u).catch(() => ''),
        resolveRouteContext(fromRoute, u).catch(() => ''),
      ]);
      setUserContext(uc);
      setRouteContext(rc);
    }).catch(() => {});
  }, [fromRoute]);

  const ask = async (raw) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    base44.analytics.track({ eventName: 'question_submitted' });
    setInput('');

    // Frustration or a direct request for a human ends the assistant loop.
    if (wantsEscalation(text)) {
      setMessages((m) => [
        ...m,
        { role: 'user', text },
        { role: 'assistant', text: 'Understood — I\u2019ll get this to support with your conversation attached.' },
      ]);
      setEscalation({ autoSend: true, reason: 'User asked for human support' });
      base44.analytics.track({ eventName: 'escalation_requested' });
      return;
    }

    const history = messages.slice(-8);
    const prevAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    setMessages((m) => [...m, { role: 'user', text }]);
    setBusy(true);
    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: buildHelpPrompt({ role, page, userContext, routeContext, history, question: text }),
      });
      const raw = typeof res === 'string' ? res : (res?.response || '');
      const { text: answer, action, invalid, repeat } = formatAnswer(raw, {
        role,
        prevAnswer: prevAssistant?.text || '',
      });
      setMessages((m) => [...m, { role: 'assistant', text: answer, action }]);
      if (invalid) {
        setEscalation({ autoSend: false, reason: 'Assistant could not answer accurately' });
      } else if (repeat) {
        setEscalation({ autoSend: false, reason: 'Assistant could not answer further without repeating' });
      }
      base44.analytics.track({ eventName: 'answer_generated' });
    } catch {
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: 'Something went wrong getting an answer. Try once more, or contact support below.' },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const newQuestion = () => {
    setMessages([]);
    setEscalation(null);
    setInput('');
  };

  if (view === 'requests') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 pb-16">
        <h1 className="font-heading text-2xl font-bold">Help</h1>
        <p className="text-sm text-muted-foreground mt-1">My support requests</p>
        <div className="mt-6">
          <HelpRequestsList onBack={() => setView('ask')} />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 pb-16">
      <h1 className="font-heading text-2xl font-bold">Help</h1>
      <p className="text-sm text-muted-foreground mt-1">How can we help?</p>

      <div className="mt-5">
        <HelpQuestionInput value={input} onChange={setInput} onSubmit={() => ask()} busy={busy} />
      </div>

      {messages.length === 0 && !escalation && (
        <div className="mt-4">
          <SuggestedQuestions
            questions={ROLE_SUGGESTIONS[role] || ROLE_SUGGESTIONS.visitor}
            onPick={ask}
          />
        </div>
      )}

      {messages.length > 0 && (
        <div className="mt-6">
          <HelpConversation
            messages={messages}
            loading={busy}
            onHelpful={() => {
              base44.analytics.track({ eventName: 'answer_helpful' });
              base44.analytics.track({ eventName: 'conversation_resolved' });
            }}
            onNotHelpful={(reason) => {
              base44.analytics.track({ eventName: 'answer_unhelpful' });
              base44.analytics.track({ eventName: 'escalation_requested' });
              setEscalation({
                autoSend: reason === 'I need human help',
                reason: `Answer marked: ${reason}`,
              });
            }}
            onActionClick={() => base44.analytics.track({ eventName: 'action_clicked' })}
          />
        </div>
      )}

      {escalation && (
        <div className="mt-4">
          <ContactSupport
            user={user}
            messages={messages}
            reason={escalation.reason}
            page={page}
            fromRoute={fromRoute}
            autoSend={escalation.autoSend}
            onViewRequests={() => setView('requests')}
          />
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-xs">
        {messages.length > 0 && (
          <button
            onClick={newQuestion}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New question
          </button>
        )}
        {!escalation && (
          <button
            onClick={() => {
              base44.analytics.track({ eventName: 'escalation_requested' });
              setEscalation({ autoSend: false, reason: 'User chose to contact support' });
            }}
            className="text-muted-foreground hover:text-primary font-medium transition-colors"
          >
            Contact Support
          </button>
        )}
        <button
          onClick={() => setView('requests')}
          className="text-muted-foreground hover:text-primary font-medium ml-auto transition-colors"
        >
          My support requests
        </button>
      </div>
    </div>
  );
}