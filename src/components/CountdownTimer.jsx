import { useState, useEffect } from 'react';

export default function CountdownTimer({ deadline, className }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const calculate = () => {
      const diff = new Date(deadline).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft('Ended'); return; }
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeLeft(days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m ${seconds}s`);
    };
    calculate();
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  return <span className={className}>{timeLeft}</span>;
}