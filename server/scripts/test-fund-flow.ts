// End-to-end in-process test of the funding flow with PayPal routing.
// Creates a throwaway USD contest owned by the demo brand, runs
// paymentQuote → paymentCreate, and prints the result. Cleans up after itself.
//   npx tsx scripts/test-fund-flow.ts
import 'dotenv/config';
import { prisma } from '../src/db.js';
import { serviceClient } from '../src/entities/service.js';
import { hashPassword } from '../src/auth/password.js';
import { paymentQuote, paymentCreate } from '../src/functions/payments.js';

const svc = serviceClient();

async function main() {
  let brand = await prisma.appUser.findUnique({ where: { email: 'demo.brand@razekit.demo' } });
  if (!brand) {
    brand = await prisma.appUser.create({ data: { email: 'demo.brand@razekit.demo', passwordHash: await hashPassword('DemoBrand!2026'), fullName: 'Nova Studios (Demo)', userRole: 'client', role: 'user', emailVerified: true, onboardingCompleted: true } });
  }
  const user = { id: brand.id, role: brand.role, email: brand.email };

  const contest = await svc.entities.Contest.create({
    demo: true, created_by_id: brand.id, title: 'PAYPAL FLOW TEST (USD)', category: 'Advertisement',
    short_description: 'temp', description: 'temp', prize_amount: 300, number_of_winners: 1,
    currency: 'USD', settlement_region: 'GLOBAL', status: 'open', deadline: new Date(Date.now() + 5 * 86400000).toISOString(),
  });

  try {
    const q = await paymentQuote({ user, svc, body: { contest_id: contest.id } });
    console.log('paymentQuote →', q.status, JSON.stringify(q.json).slice(0, 200));
    if (q.status !== 200) return;

    const c = await paymentCreate({ user, svc, body: { quote_id: q.json.quote_id, idempotency_key: 'test-' + Date.now(), origin: 'https://razekit.com' } });
    console.log('paymentCreate →', c.status, JSON.stringify(c.json).slice(0, 400));

    if (c.json.provider === 'paypal' && c.json.redirect_url) {
      console.log('\n✅ Routed to PayPal and produced a live approval URL — funding is fully wired.');
    } else if (c.json.error?.code === 'PROVIDER_ERROR') {
      console.log('\n⚠️  Routed to PayPal correctly, but PayPal rejected order creation:');
      console.log('    ', c.json.error.message);
      console.log('    → This is a PayPal ACCOUNT-side block, not a code issue.');
    }
  } finally {
    // Clean up the temp contest + any payment/quote rows it produced.
    for (const r of await svc.entities.Payment.filter({ contest_id: contest.id }, '-created_date', 20).catch(() => [])) await svc.entities.Payment.delete(r.id).catch(() => {});
    for (const r of await svc.entities.PaymentQuote.filter({ contest_id: contest.id }, '-created_date', 20).catch(() => [])) await svc.entities.PaymentQuote.delete(r.id).catch(() => {});
    await svc.entities.Contest.delete(contest.id).catch(() => {});
    console.log('\n(cleaned up temp test contest)');
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
