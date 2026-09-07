import { Search as SearchIcon } from 'lucide-react';

// Discovery search + category chip rail — real categories derived from live data.
export default function FilterBar({ search, onSearch, categories, category, onCategory }) {
  return (
    <div className="space-y-3">
      <div className="relative">
        <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search contests"
          aria-label="Search contests"
          className="w-full h-11 rounded-full border border-input bg-white/70 backdrop-blur-sm pl-10 pr-4 text-sm shadow-sm transition-all ease-brand placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary/50"
        />
      </div>
      {categories.length > 2 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-0.5">
          {categories.map((c) => {
            const active = category === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => onCategory(c)}
                className={`shrink-0 h-8 px-3.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200 ease-brand press
                  ${active
                    ? 'bg-primary text-primary-foreground shadow-primary-glow'
                    : 'bg-white/70 border border-border text-muted-foreground hover:text-foreground hover:border-primary/30'}`}
              >
                {c}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}