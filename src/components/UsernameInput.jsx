import { useState, useEffect, useRef } from 'react';
import { Check, X, Loader2, AtSign } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { validateUsername, checkUsernameAvailable, suggestUsernames } from '@/lib/username-utils';

export default function UsernameInput({ value, onChange, displayName, label = 'Username', onStatusChange, disabled = false }) {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const debounceRef = useRef(null);
  const onStatusRef = useRef(onStatusChange);

  useEffect(() => { onStatusRef.current = onStatusChange; });

  useEffect(() => {
    if (!value) {
      setStatus('idle'); setError(''); setSuggestions([]);
      onStatusRef.current?.(false);
      return;
    }
    const validation = validateUsername(value);
    if (!validation.valid) {
      setStatus('invalid'); setError(validation.error); setSuggestions([]);
      onStatusRef.current?.(false);
      return;
    }
    setStatus('checking'); setError('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const result = await checkUsernameAvailable(value);
      if (result.available) {
        setStatus('available'); setError(''); setSuggestions([]);
        onStatusRef.current?.(true);
      } else {
        setStatus('taken'); setError(result.error || 'Already taken');
        setSuggestions(result.suggestions.length > 0 ? result.suggestions : suggestUsernames(value, displayName));
        onStatusRef.current?.(false);
      }
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [value, displayName]);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="relative">
        <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={value}
          onChange={e => onChange(e.target.value.replace(/\s/g, '').toLowerCase())}
          placeholder="username"
          className="pl-10 h-12"
          autoCapitalize="none"
          autoCorrect="off"
          disabled={disabled}
        />
        {status === 'checking' && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
        {status === 'available' && <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-success" />}
        {(status === 'taken' || status === 'invalid') && <X className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-destructive" />}
      </div>
      {status === 'available' && <p className="text-xs text-success flex items-center gap-1"><Check className="w-3 h-3" /> Username available</p>}
      {error && <p className="text-xs text-destructive flex items-center gap-1"><X className="w-3 h-3" /> {error}</p>}
      {suggestions.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Suggestions:</p>
          {suggestions.map(s => (
            <button key={s} type="button" onClick={() => onChange(s)} className="text-xs text-primary hover:underline block">
              @{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}