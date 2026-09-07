import { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function StarRating({ value = 0, onChange, size = 'md', readOnly = false }) {
  const [hover, setHover] = useState(0);
  const display = hover || value;
  const sizeClass = size === 'sm' ? 'w-5 h-5' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6';

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onMouseEnter={() => !readOnly && setHover(n)}
          onMouseLeave={() => !readOnly && setHover(0)}
          onClick={() => !readOnly && onChange?.(n)}
          className={cn('transition-transform', !readOnly && 'hover:scale-110', readOnly && 'cursor-default')}
        >
          <Star
            className={cn(sizeClass, n <= display ? 'fill-primary text-primary' : 'fill-transparent text-border')}
          />
        </button>
      ))}
    </div>
  );
}