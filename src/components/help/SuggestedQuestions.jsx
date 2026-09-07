export default function SuggestedQuestions({ questions, onPick }) {
  return (
    <div className="flex flex-wrap gap-2">
      {questions.map((q) => (
        <button
          key={q}
          onClick={() => onPick(q)}
          className="text-xs px-3.5 py-2 rounded-full border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
        >
          {q}
        </button>
      ))}
    </div>
  );
}