// Replacement for Base44's `secrets` from 'base44:runtime'.
// The money provider code calls secrets.get('RAZORPAY_KEY_ID') etc. — same API,
// now backed by process.env. Unset secrets return null (the router degrades to
// PROVIDER_UNAVAILABLE, exactly as before).
export const secrets = {
  get(name: string): string | null {
    const v = process.env[name];
    return v && v.length ? v : null;
  },
};
