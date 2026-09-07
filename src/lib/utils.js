import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
} 


export const isIframe = window.self !== window.top;

// Currency-aware prize formatting — never hard-code the symbol independent of the contest currency.
export function formatPrize(amount, currency) {
  const n = Number(amount) || 0;
  if (currency === 'USD') return `$${n.toLocaleString('en-US')}`;
  return `₹${n.toLocaleString('en-IN')}`;
}
