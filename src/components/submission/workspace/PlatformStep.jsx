import { Check, X } from 'lucide-react';
import { PLATFORMS, PLATFORMS_BY_ID, contestPlatforms } from '@/lib/submission/platforms';
import { entryComplete } from '@/lib/submission/requirements';
import PlatformFieldInput from './PlatformFieldInput';

// Platform Details step — config-driven. Supports single- and multi-platform
// contests via tabs; each entry carries its own content type, fields, URL
// and caption state.
export default function PlatformStep({ reqs, value = [], onChange, onPlatformSelected }) {
  const available = reqs.freePlatformChoice ? PLATFORMS : contestPlatforms(reqs.platforms);
  const entries = value;
  const multi = available.length > 1;

  const add = (id) => {
    const p = PLATFORMS_BY_ID[id];
    if (!p || entries.some((e) => e.platformId === id)) return;
    onChange([...entries, { platformId: id, contentType: p.contentTypes[0] || 'Custom', fields: {}, notPublished: false }]);
    onPlatformSelected?.(id);
  };
  const remove = (idx) => onChange(entries.filter((_, i) => i !== idx));
  const update = (idx, patch) => onChange(entries.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  const updateField = (idx, key, val) =>
    onChange(entries.map((e, i) => (i === idx ? { ...e, fields: { ...e.fields, [key]: val } } : e)));

  const remaining = available.filter((p) => !entries.some((e) => e.platformId === p.id));

  return (
    <div>
      <div className="mb-4">
        <p className="text-sm font-semibold">Platform details</p>
        <p className="text-xs text-muted-foreground">
          {multi
            ? 'This contest accepts multiple platforms — add each one you are submitting for.'
            : entries.length
              ? 'Complete the details for your submission.'
              : 'Choose the platform your submission is for.'}
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-wrap gap-2">
          {available.map((p) => (
            <button
              key={p.id}
              onClick={() => add(p.id)}
              className="text-sm px-4 py-2.5 rounded-full border border-border bg-card hover:border-primary/50 hover:text-primary transition-colors font-medium"
            >
              {p.label}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {entries.map((e, idx) => {
              const p = PLATFORMS_BY_ID[e.platformId];
              const complete = entryComplete(reqs, e);
              return (
                <span
                  key={e.platformId}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-full border transition-colors ${
                    complete ? 'border-success/40 bg-success/5 text-success' : 'border-primary/40 bg-primary/5 text-primary'
                  }`}
                >
                  {complete && <Check className="w-3.5 h-3.5" aria-label="Complete" />}
                  {p?.label || e.platformId}
                  <button
                    aria-label={`Remove ${p?.label}`}
                    onClick={() => remove(idx)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              );
            })}
            {multi && remaining.length > 0 && (
              <div className="relative inline-block">
                <select
                  aria-label="Add another platform"
                  value=""
                  onChange={(e) => e.target.value && add(e.target.value)}
                  className="appearance-none text-xs font-medium pl-3 pr-8 py-2 rounded-full border border-dashed border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors cursor-pointer"
                >
                  <option value="">+ Add platform</option>
                  {remaining.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="space-y-6">
            {entries.map((entry, idx) => {
              const p = PLATFORMS_BY_ID[entry.platformId];
              if (!p) return null;
              const hasNotPublished = p.fields.some((f) => f.type === 'url' && f.notPublishedAllowed);
              return (
                <div key={entry.platformId} className="bg-card border border-border rounded-2xl p-4 animate-fade-in">
                  <p className="font-heading text-sm font-bold mb-3">{p.label}</p>

                  {p.contentTypes.length > 1 && !p.customPlatform ? (
                    <div className="mb-4">
                      <p className="text-xs font-semibold mb-1.5">Content type <span className="text-[10px] text-primary uppercase tracking-wide">Required</span></p>
                      <div className="flex flex-wrap gap-2">
                        {p.contentTypes.map((ct) => (
                          <button
                            key={ct}
                            type="button"
                            aria-pressed={entry.contentType === ct}
                            onClick={() => update(idx, { contentType: ct })}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                              entry.contentType === ct ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-primary'
                            }`}
                          >
                            {ct}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {hasNotPublished && (
                    <label className="flex items-start gap-2 mb-4 bg-secondary/40 rounded-xl px-3 py-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={entry.notPublished}
                        onChange={(e) => update(idx, { notPublished: e.target.checked })}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="text-xs font-medium block">Not published yet</span>
                        <span className="text-[11px] text-muted-foreground">
                          You can submit the final creative first. A live URL may be requested after winning or approval.
                        </span>
                      </span>
                    </label>
                  )}

                  <div className="space-y-4">
                    {p.fields.map((f) => (
                      <PlatformFieldInput
                        key={f.key}
                        reqs={reqs}
                        entry={entry}
                        field={f}
                        onChange={(key, val) => updateField(idx, key, val)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}