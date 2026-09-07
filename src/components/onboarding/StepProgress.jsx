export default function StepProgress({ steps, current }) {
  return (
    <div className="flex items-center gap-1.5 mb-6">
      {steps.map((s, i) => (
        <div key={i} className="flex-1 flex flex-col gap-1">
          <div
            className={`h-1.5 rounded-full transition-all ${
              i === current ? 'bg-primary' : i < current ? 'bg-primary/50' : 'bg-secondary'
            }`}
          />
          <span
            className={`text-[10px] truncate ${
              i === current ? 'text-primary font-medium' : 'text-muted-foreground'
            }`}
          >
            {s.title}
          </span>
        </div>
      ))}
    </div>
  );
}