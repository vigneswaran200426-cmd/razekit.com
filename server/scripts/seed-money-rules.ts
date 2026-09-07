// Seeds default MoneyRules for the India (INR) market so paymentQuote works.
// Idempotent: skips a (rule_type, market, currency, version) that already exists.
// Tune the basis points to your real commercial terms before going live.
import { serviceClient } from '../src/entities/service.js';

const svc = serviceClient();

const RULES = [
  { rule_type: 'PLATFORM_FEE', market: 'IN', currency: 'INR', version: 'v1', fee_model: 'STANDARD_PERCENTAGE', percentage_bps: 1000, active: true, notes: '10% platform fee on prize subtotal' },
  { rule_type: 'PROCESSING_FEE', market: 'IN', currency: 'INR', version: 'v1', fee_model: 'STANDARD_PERCENTAGE', percentage_bps: 200, active: true, notes: '2% processing fee' },
  { rule_type: 'TAX', market: 'IN', currency: 'INR', version: 'v1', fee_model: 'STANDARD_PERCENTAGE', percentage_bps: 1800, active: true, notes: '18% GST on marketplace charges' },
];

for (const r of RULES) {
  const existing = await svc.entities.MoneyRule.filter({ rule_type: r.rule_type, market: r.market, currency: r.currency, version: r.version }, '-created_date', 1);
  if (existing.length) {
    console.log(`= exists: ${r.rule_type} ${r.market}/${r.currency} ${r.version}`);
    continue;
  }
  await svc.entities.MoneyRule.create(r);
  console.log(`+ created: ${r.rule_type} ${r.market}/${r.currency} ${r.version} (${r.percentage_bps} bps)`);
}
console.log('Money rules seeded.');
process.exit(0);
