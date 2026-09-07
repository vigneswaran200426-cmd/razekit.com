import { base44 } from '@/api/base44Client';

export const getDeviceType = () => {
  const ua = navigator.userAgent;
  if (/Mobile|Android|iPhone/i.test(ua)) return 'Mobile';
  if (/iPad|Tablet/i.test(ua)) return 'Tablet';
  return 'Desktop';
};

export const getBrowserInfo = () => {
  const ua = navigator.userAgent;
  if (/Edg/i.test(ua)) return 'Edge';
  if (/Chrome/i.test(ua)) return 'Chrome';
  if (/Firefox/i.test(ua)) return 'Firefox';
  if (/Safari/i.test(ua)) return 'Safari';
  return 'Other';
};

export const logEvent = async (userId, contestId, eventType, extra = {}) => {
  try {
    await base44.entities.FootageAccessLog.create({
      user_id: userId,
      contest_id: contestId,
      event_type: eventType,
      ip_address: 'client-side',
      user_agent: navigator.userAgent.slice(0, 200),
      device_type: getDeviceType(),
      ...extra,
    });
  } catch (e) {}
};

export const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const isExpired = (dateStr) => {
  if (!dateStr) return true;
  return new Date(dateStr).getTime() < Date.now();
};