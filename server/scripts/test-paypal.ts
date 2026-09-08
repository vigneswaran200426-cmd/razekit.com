// Live sandbox smoke test for the PayPal provider. Verifies OAuth + Orders v2
// create against the configured PAYPAL_* env. Run: npx tsx scripts/test-paypal.ts
import 'dotenv/config';
import { createOrder, fetchOrder, PAYPAL_CURRENCIES, amountValue } from '../src/money/providers/paypal.js';

const creds = {
  clientId: process.env.PAYPAL_CLIENT_ID || '',
  clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
  env: (process.env.PAYPAL_ENV || 'sandbox') as 'sandbox' | 'live',
};

async function main() {
  console.log('env:', creds.env, '| clientId set:', Boolean(creds.clientId), '| secret set:', Boolean(creds.clientSecret));
  console.log('USD supported:', PAYPAL_CURRENCIES.has('USD'), '| INR supported:', PAYPAL_CURRENCIES.has('INR'));
  console.log('amountValue(30000, USD):', amountValue(30000, 'USD')); // $300.00

  const order = await createOrder(creds as any, {
    amountMinor: 30000, currency: 'USD', reference: 'RK-TEST-' + Date.now(),
    returnUrl: 'https://razekit.com/contest/x/fund?paypal_return=1',
    cancelUrl: 'https://razekit.com/contest/x/fund?payment=cancelled',
  });
  console.log('createOrder →', { id: order.id, status: order.status, approveUrl: order.approveUrl });

  const fetched = await fetchOrder(creds as any, order.id);
  console.log('fetchOrder → status:', fetched.status, '| amount:', fetched.purchase_units?.[0]?.amount);
  console.log('\n✅ PayPal sandbox integration works. Approve URL above would take the payer to PayPal.');
}

main().catch((e) => { console.error('❌', e.message || e); process.exit(1); });
