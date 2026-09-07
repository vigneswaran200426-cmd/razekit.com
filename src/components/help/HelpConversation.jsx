import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';

const FEEDBACK_REASONS = [
  "Didn't answer my question",
  'Information was incorrect',
  "Couldn't solve my problem",
  'I need human help',
];

// Clean conversation area — assistant messages look like product-help
// responses, user messages stay compact. No chatbot theatrics.
export default function HelpConversation({ messages, loading, onHelpful, onNotHelpful, onActionClick }) {
  const [feedbackDone, setFeedbackDone] = useState(false);
  const [showReasons, setShowReasons] = useState(false);

  // Reset the feedback prompt whenever a new answer arrives.
  useEffect(() => {
    setFeedbackDone(false);
    setShowReasons(false);
  }, [messages.length]);

  return (
    <div className="space-y-3">
      {messages.map((m, i) => (
        <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div
            className={
              m.role === 'user'
                ? 'max-w-[85%] bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap'
                : 'max-w-[85%] bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap card-shadow'
            }
          >
            {m.text}
            {m.action && (
              <Link
                to={m.action.to}
                onClick={onActionClick}
                className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                {m.action.label} <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        </div>
      ))}

      {loading && (
        <div className="flex justify-start">
          <div className="bg-card border border-border rounded-2xl px-4 py-2.5 text-xs text-muted-foreground inline-flex items-center gap-2 card-shadow">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Looking that up…
          </div>
        </div>
      )}

      {!loading && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && !feedbackDone && (
        <div className="pt-1">
          {!showReasons ? (
            <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
              Helpful?
              <button
                onClick={() => { setFeedbackDone(true); onHelpful?.(); }}
                className="font-medium text-foreground hover:text-primary transition-colors"
              >
                Yes
              </button>
              <button
                onClick={() => setShowReasons(true)}
                className="font-medium text-foreground hover:text-primary transition-colors"
              >
                No
              </button>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl p-3.5 card-shadow">
              <p className="text-xs font-semibold mb-2">What went wrong?</p>
              <div className="flex flex-wrap gap-1.5">
                {FEEDBACK_REASONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => { setFeedbackDone(true); onNotHelpful?.(r); }}
                    className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}