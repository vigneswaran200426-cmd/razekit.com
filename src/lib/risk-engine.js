// Razekit risk engine (ADMIN-ONLY). Combines multiple REAL platform signals into an
// explainable creator risk score (0-100). Approach inspired by standard fraud-feature
// methods (ratio/velocity/dispute/anomaly signals) — but NO model bans anyone: this only
// surfaces risk for admin review. Every destructive action stays behind admin authorization.

export const RISK_WEIGHTS = {
  fraud_alert_critical: 30, fraud_alert_high: 18, fraud_alert_medium: 8,
  report_verified: 20, report_open: 6, warning: 12,
  standing_suspended: 40, standing_restricted: 22, standing_warning: 8,
  payment_failed: 6, payment_disputed: 15, withdrawal_failed: 8,
};

export const RISK_LEVELS = [
  { min: 80, level: 'CRITICAL', tone: 'destructive' },
  { min: 50, level: 'HIGH', tone: 'amber' },
  { min: 30, level: 'MEDIUM', tone: 'amber' },
  { min: 0, level: 'LOW', tone: 'success' },
];
export const riskLevel = (score) => RISK_LEVELS.find((l) => score >= l.min) || RISK_LEVELS[RISK_LEVELS.length - 1];

const clampAdd = (arr, pts, cap, label) => { const v = Math.min(pts, cap); if (v > 0) arr.push({ points: Math.round(v), label }); return v; };

/**
 * signals = {
 *   fraudAlerts:[{severity,status}], reports:[{status}], warnings:Number, standingStatus:String,
 *   payments:[{status}], withdrawals:[{status}], wins:Number, contestsCompleted:Number,
 *   socialConnections:[{verified}]
 * }
 * Returns { score, level, tone, reasons:[{points,label}], trust }
 */
export function computeCreatorRisk(s = {}) {
  const reasons = [];
  let score = 0;

  const fa = (s.fraudAlerts || []).filter((a) => a.status !== 'cleared');
  const crit = fa.filter((a) => a.severity === 'critical').length;
  const high = fa.filter((a) => a.severity === 'high').length;
  const med = fa.filter((a) => a.severity === 'medium').length;
  if (crit) score += clampAdd(reasons, RISK_WEIGHTS.fraud_alert_critical * crit, 40, `${crit} critical fraud alert${crit > 1 ? 's' : ''}`);
  if (high) score += clampAdd(reasons, RISK_WEIGHTS.fraud_alert_high * high, 30, `${high} high-severity fraud alert${high > 1 ? 's' : ''}`);
  if (med) score += clampAdd(reasons, RISK_WEIGHTS.fraud_alert_medium * med, 16, `${med} medium fraud alert${med > 1 ? 's' : ''}`);

  const reports = s.reports || [];
  const verified = reports.filter((r) => ['action_taken', 'verified_violation'].includes(r.status)).length;
  const openR = reports.filter((r) => ['submitted', 'reviewing'].includes(r.status)).length;
  if (verified) score += clampAdd(reasons, RISK_WEIGHTS.report_verified * verified, 30, `${verified} verified report${verified > 1 ? 's' : ''}`);
  if (openR) score += clampAdd(reasons, RISK_WEIGHTS.report_open * openR, 18, `${openR} open report${openR > 1 ? 's' : ''}`);

  if (s.warnings) score += clampAdd(reasons, RISK_WEIGHTS.warning * s.warnings, 24, `${s.warnings} policy warning${s.warnings > 1 ? 's' : ''}`);

  if (s.standingStatus === 'suspended' || s.standingStatus === 'terminated') score += clampAdd(reasons, RISK_WEIGHTS.standing_suspended, 40, `Account ${s.standingStatus}`);
  else if (s.standingStatus === 'restricted') score += clampAdd(reasons, RISK_WEIGHTS.standing_restricted, 22, 'Account restricted');
  else if (s.standingStatus === 'warning') score += clampAdd(reasons, RISK_WEIGHTS.standing_warning, 8, 'Account on warning');

  const pay = s.payments || [];
  const failed = pay.filter((p) => p.status === 'failed').length;
  const disputed = pay.filter((p) => ['disputed', 'refunded'].includes(p.status)).length;
  if (failed >= 3) score += clampAdd(reasons, RISK_WEIGHTS.payment_failed * failed, 18, `${failed} failed payments`);
  if (disputed) score += clampAdd(reasons, RISK_WEIGHTS.payment_disputed * disputed, 30, `${disputed} disputed/refunded payment${disputed > 1 ? 's' : ''}`);

  const wdFailed = (s.withdrawals || []).filter((w) => w.status === 'failed').length;
  if (wdFailed) score += clampAdd(reasons, RISK_WEIGHTS.withdrawal_failed * wdFailed, 16, `${wdFailed} failed withdrawal${wdFailed > 1 ? 's' : ''}`);

  score = Math.max(0, Math.min(100, Math.round(score)));
  const lvl = riskLevel(score);

  // Trust score is separate: lowered by risk, raised by verified positive history.
  const positive = (s.wins || 0) * 4 + (s.contestsCompleted || 0) + (s.socialConnections || []).filter((c) => c.verified).length * 5;
  const trust = Math.max(0, Math.min(100, Math.round(100 - score * 0.8 + Math.min(positive, 30))));

  return { score, level: lvl.level, tone: lvl.tone, reasons: reasons.sort((a, b) => b.points - a.points), trust };
}
