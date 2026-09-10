import 'dotenv/config';

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing required env var: ${name}`);
  return v;
}

const env = process.env.NODE_ENV || 'development';
const isProduction = env === 'production';

export const config = {
  env,
  port: Number(process.env.PORT || 4000),
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:4000',
  webBaseUrl: process.env.WEB_BASE_URL || 'http://localhost:5173',
  // RazeKit's own production origins are always allowed. A missing or
  // half-filled CORS_ORIGINS on the host previously broke production login, and
  // would break the admin console the same way. These are first-party domains,
  // not a wildcard; CORS_ORIGINS adds to them (preview deploys, staging).
  corsOrigins: [
    ...new Set([
      'https://razekit.com',
      'https://www.razekit.com',
      'https://admin.razekit.com',
      'https://razekit-web.onrender.com',
      'http://localhost:5173',
      'http://localhost:5174',
      ...(process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
    ]),
  ],

  // Never run production with the development JWT fallback.
  jwtSecret: isProduction ? req('JWT_SECRET') : req('JWT_SECRET', 'dev-insecure-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',

  // ── Admin database (optional second Neon project) ──────────────────────────
  // When set, the admin-only entities live here instead of the platform
  // database. When unset, everything uses one database and nothing changes.
  //
  // Only entities with NO transactional relationship to platform data may live
  // here — see entities/routing.ts for why AuditLog is not one of them.
  adminDatabaseUrl: process.env.ADMIN_DATABASE_URL || '',

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
  },

  storage: {
    driver: (process.env.STORAGE_DRIVER || 'local') as 'local' | 's3',
    publicBaseUrl: process.env.STORAGE_PUBLIC_BASE_URL || 'http://localhost:4000/files',
    s3: {
      endpoint: process.env.S3_ENDPOINT || '',
      region: process.env.S3_REGION || 'auto',
      accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
      bucketPublic: process.env.S3_BUCKET_PUBLIC || 'razekit-public',
      bucketPrivate: process.env.S3_BUCKET_PRIVATE || 'razekit-private',
      forcePathStyle: (process.env.S3_FORCE_PATH_STYLE || 'true') === 'true',
    },
  },

  email: {
    driver: (process.env.EMAIL_DRIVER || 'console') as 'console' | 'resend' | 'smtp',
    from: process.env.EMAIL_FROM || 'RazeKit <support@razekit.com>',
    supportEmail: process.env.SUPPORT_EMAIL || 'support@razekit.com',
    resendApiKey: process.env.RESEND_API_KEY || '',
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: Number(process.env.SMTP_PORT || 587),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  },

  llm: {
    driver: (process.env.LLM_DRIVER || 'stub') as 'stub' | 'anthropic',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.LLM_MODEL || 'claude-sonnet-5',
  },

  image: {
    driver: (process.env.IMAGE_DRIVER || 'stub') as 'stub' | 'openai',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.IMAGE_MODEL || 'gpt-image-1',
  },

  enableScheduler: (process.env.ENABLE_SCHEDULER || 'true') === 'true',

  // ── Beta manual payment ────────────────────────────────────────────────────
  // Server-only. `bank` is never serialised into a public response, a client
  // bundle, or a log line; payments/config.ts is the single reader and it masks
  // the account number everywhere except the authorised instructions response.
  payments: {
    mode: (process.env.PAYMENT_MODE || 'MANUAL_BETA') as 'MANUAL_BETA' | 'GATEWAY' | 'MAINTENANCE',
    verificationHours: Number(process.env.BETA_FUNDING_VERIFICATION_HOURS || 24),
    support: {
      phone: process.env.BETA_SUPPORT_PHONE || '',
      email: process.env.BETA_SUPPORT_EMAIL || process.env.SUPPORT_EMAIL || '',
    },
    bank: {
      accountName: process.env.BETA_BANK_ACCOUNT_NAME || '',
      bankName: process.env.BETA_BANK_NAME || '',
      branch: process.env.BETA_BANK_BRANCH || '',
      accountNumber: process.env.BETA_BANK_ACCOUNT_NUMBER || '',
      ifsc: process.env.BETA_BANK_IFSC || '',
      upiId: process.env.BETA_BANK_UPI_ID || '',
    },
  },
};

export type AppConfig = typeof config;