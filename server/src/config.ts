import 'dotenv/config';

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:4000',
  webBaseUrl: process.env.WEB_BASE_URL || 'http://localhost:5173',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  jwtSecret: req('JWT_SECRET', 'dev-insecure-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',

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
};

export type AppConfig = typeof config;
