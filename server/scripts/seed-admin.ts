// Creates (or promotes) the first platform admin from ADMIN_EMAIL/ADMIN_PASSWORD.
import { config } from '../src/config.js';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/auth/password.js';

const email = (process.env.ADMIN_EMAIL || 'admin@razekit.com').toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';
if (!password || password.length < 8) {
  console.error('Set ADMIN_PASSWORD (>=8 chars) in .env before seeding the admin.');
  process.exit(1);
}

const existing = await prisma.appUser.findUnique({ where: { email } });
if (existing) {
  await prisma.appUser.update({ where: { id: existing.id }, data: { role: 'admin', emailVerified: true } });
  console.log(`Promoted existing user ${email} to admin.`);
} else {
  await prisma.appUser.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      fullName: 'Platform Admin',
      role: 'admin',
      userRole: 'visitor',
      emailVerified: true,
      onboardingCompleted: true,
    },
  });
  console.log(`Created admin ${email}.`);
}
process.exit(0);
