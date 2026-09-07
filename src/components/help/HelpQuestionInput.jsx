import { Send, Loader2 } from 'lucide-react';

export default function HelpQuestionInput({ value, onChange, onSubmit, busy, placeholder }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="relative">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || 'What do you need help with?'}
        aria-label="Ask a question"
        className="w-full h-14 pl-5 pr-16 rounded-2xl border border-border bg-white shadow-glass text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
      />
      <button
        type="submit"
        disabled={busy || !value.trim()}
        aria-label="Send question"
        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:bg-[#0B48E8] transition-colors"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
      </button>
    </form>
  );
}