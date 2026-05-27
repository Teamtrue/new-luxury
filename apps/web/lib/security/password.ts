/**
 * lib/security/password.ts
 * ---------------------------------------------------------------------------
 * Password hashing, verification, and strength validation for PlutusClub.
 * ---------------------------------------------------------------------------
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let bcrypt: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  bcrypt = require('bcryptjs');
} catch {
  bcrypt = {
    genSalt:  () => { throw new Error('bcryptjs is not installed. Run: pnpm add bcryptjs'); },
    hash:     () => { throw new Error('bcryptjs is not installed. Run: pnpm add bcryptjs'); },
    compare:  () => { throw new Error('bcryptjs is not installed. Run: pnpm add bcryptjs'); },
  };
}

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < 10) errors.push('Password must be at least 10 characters long.');
  if (!/[A-Z]/.test(password)) errors.push('Password must contain at least one uppercase letter (A-Z).');
  if (!/[a-z]/.test(password)) errors.push('Password must contain at least one lowercase letter (a-z).');
  if (!/[0-9]/.test(password)) errors.push('Password must contain at least one number (0-9).');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('Password must contain at least one special character (e.g. !@#$%^&*).');

  return { valid: errors.length === 0, errors };
}

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '123456789',
  '1234567890',
  '12345678',
  'qwerty123',
  'qwerty',
  'iloveyou',
  'admin123',
  'admin1234',
  'letmein',
  'welcome1',
  'monkey123',
  'dragon123',
  'master123',
  'sunshine1',
  'princess1',
  'football1',
  'superman1',
]);

export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.toLowerCase());
}
