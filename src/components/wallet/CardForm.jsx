import { useState } from 'react';
import { CreditCard, Lock } from 'lucide-react';
import { detectCardType, formatCardNumber, formatExpiry } from '@/lib/payment-utils';

export default function CardForm({ card, setCard, errors }) {
  const [focused, setFocused] = useState(null);
  const cardType = detectCardType(card.number || '');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Card Details</span>
        </div>
        <span className="text-xs font-semibold text-muted-foreground bg-secondary px-2 py-1 rounded">{cardType}</span>
      </div>

      <div>
        <input
          type="text"
          inputMode="numeric"
          placeholder="Card number"
          value={card.number || ''}
          onChange={e => setCard({ ...card, number: formatCardNumber(e.target.value) })}
          onFocus={() => setFocused('number')}
          onBlur={() => setFocused(null)}
          className={`w-full bg-input border rounded-xl px-4 py-3 text-sm font-mono tracking-wider focus:outline-none transition-colors ${focused === 'number' ? 'border-primary' : errors?.number ? 'border-destructive' : 'border-border'}`}
        />
        {errors?.number && <p className="text-xs text-destructive mt-1">{errors.number}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <input
            type="text"
            inputMode="numeric"
            placeholder="MM/YY"
            value={card.expiry || ''}
            onChange={e => setCard({ ...card, expiry: formatExpiry(e.target.value) })}
            onFocus={() => setFocused('expiry')}
            onBlur={() => setFocused(null)}
            className={`w-full bg-input border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none transition-colors ${focused === 'expiry' ? 'border-primary' : errors?.expiry ? 'border-destructive' : 'border-border'}`}
          />
          {errors?.expiry && <p className="text-xs text-destructive mt-1">{errors.expiry}</p>}
        </div>
        <div>
          <input
            type="text"
            inputMode="numeric"
            placeholder="CVC"
            maxLength={4}
            value={card.cvc || ''}
            onChange={e => setCard({ ...card, cvc: e.target.value.replace(/\D/g, '') })}
            onFocus={() => setFocused('cvc')}
            onBlur={() => setFocused(null)}
            className={`w-full bg-input border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none transition-colors ${focused === 'cvc' ? 'border-primary' : errors?.cvc ? 'border-destructive' : 'border-border'}`}
          />
          {errors?.cvc && <p className="text-xs text-destructive mt-1">{errors.cvc}</p>}
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="w-3 h-3" />
        <span>Secured by Stripe · Your card details are encrypted</span>
      </div>
    </div>
  );
}