export default function PillSelect({ options, value, onChange, allowCustom = false, customValue, onCustomChange, customPlaceholder, customInputType = 'text' }) {
  const isCustomSelected = value === 'Custom';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button key={opt} type="button" onClick={() => onChange(opt)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200
              ${value === opt ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground'}`}>
            {opt}
          </button>
        ))}
        {allowCustom && (
          <button type="button" onClick={() => onChange('Custom')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200
              ${isCustomSelected ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground'}`}>
            Custom
          </button>
        )}
      </div>
      {allowCustom && isCustomSelected && (
        <input type={customInputType} value={customValue || ''} onChange={(e) => onCustomChange(e.target.value)}
          placeholder={customPlaceholder || 'Enter custom value'}
          className="w-full px-4 py-2.5 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
      )}
    </div>
  );
}