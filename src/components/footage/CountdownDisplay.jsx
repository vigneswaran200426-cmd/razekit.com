import { useState, useEffect } from 'react';

export default function CountdownDisplay({ expiresAt, onExpire, className, showSeconds = true }) {
  const [timeLeft, setTimeLeft] = useState('');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const calc = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('Expired');
        if (!expired) {
          setExpired(true);
          if (onExpire) onExpire();
        }
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeLeft(showSeconds ? `${mins}:${secs.toString().padStart(2, '0')}` : `${mins}m ${secs}s`);
    };
    calc();
    const interval = setInterval(calc, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return <span className={className}>{timeLeft}</span>;
}