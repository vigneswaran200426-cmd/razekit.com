export const COMMISSION_RATE = 0.10;
export const CREATOR_COMMISSION_RATE = 0.10;
export const STRIPE_PROCESSING_RATE = 0.029;
export const STRIPE_FIXED_FEE = 3;
export const TAX_RATE = 0.18;
export const MIN_WITHDRAWAL = 500;
export const MAX_WITHDRAWAL = 50000;
export const MIN_DEPOSIT = 100;
export const MAX_DEPOSIT = 100000;

export const calcPaymentBreakdown = (amount, type = 'deposit') => {
  const amt = Number(amount) || 0;
  const processingFee = Math.round((amt * STRIPE_PROCESSING_RATE + STRIPE_FIXED_FEE) * 100) / 100;
  const taxes = Math.round(processingFee * TAX_RATE * 100) / 100;
  const platformCommission = type === 'prize' ? Math.round(amt * COMMISSION_RATE) : 0;
  const creatorCommission = type === 'prize' ? Math.round(amt * CREATOR_COMMISSION_RATE) : 0;
  const totalFees = processingFee + taxes;
  const netAmount = type === 'withdrawal' ? Math.max(0, amt - totalFees) : amt;
  const clientTotal = amt + totalFees;
  const platformRevenue = platformCommission + taxes;
  const creatorEarnings = amt - platformCommission - creatorCommission;

  return {
    amount: amt,
    processingFee,
    taxes,
    totalFees,
    platformCommission,
    creatorCommission,
    netAmount,
    clientTotal,
    platformRevenue,
    creatorEarnings,
  };
};

export const generateReferenceNumber = () => {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `PAY-${ts}${rand}`;
};

export const detectFraud = (transactions, amount, type) => {
  const alerts = [];
  const now = Date.now();
  const recentTxns = transactions.filter(t => now - new Date(t.created_date).getTime() < 60000);
  if (recentTxns.length >= 5) {
    alerts.push({ type: 'velocity_attack', severity: 'high', details: `${recentTxns.length} transactions in 1 minute` });
  }
  if (type === 'withdrawal' && amount > 25000) {
    alerts.push({ type: 'large_withdrawal', severity: 'medium', details: `Large withdrawal: ₹${amount}` });
  }
  const failedCount = transactions.filter(t => t.status === 'failed').length;
  if (failedCount >= 3) {
    alerts.push({ type: 'multiple_failures', severity: 'high', details: `${failedCount} failed transactions` });
  }
  const duplicate = transactions.find(t =>
    t.amount === amount && t.type === type && now - new Date(t.created_date).getTime() < 30000
  );
  if (duplicate) {
    alerts.push({ type: 'duplicate_transaction', severity: 'medium', details: `Duplicate transaction detected` });
  }
  return alerts;
};

export const detectCardType = (number) => {
  const cleaned = number.replace(/\s/g, '');
  if (/^4/.test(cleaned)) return 'Visa';
  if (/^5[1-5]/.test(cleaned)) return 'Mastercard';
  if (/^3[47]/.test(cleaned)) return 'Amex';
  if (/^6/.test(cleaned)) return 'Discover';
  if (/^(6011|65|64[4-9])/.test(cleaned)) return 'Discover';
  return 'Card';
};

export const formatCardNumber = (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
};

export const formatExpiry = (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return digits;
};

export const validateCard = (card) => {
  const errors = {};
  const numDigits = card.number?.replace(/\s/g, '') || '';
  if (numDigits.length < 13) errors.number = 'Enter a valid card number';
  if (!card.expiry || card.expiry.length < 5) errors.expiry = 'MM/YY';
  else {
    const [mm, yy] = card.expiry.split('/');
    const month = parseInt(mm);
    if (month < 1 || month > 12) errors.expiry = 'Invalid month';
  }
  if (!card.cvc || card.cvc.length < 3) errors.cvc = 'CVC';
  return errors;
};