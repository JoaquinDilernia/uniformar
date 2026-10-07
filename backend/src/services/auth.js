import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export const COOKIE = 'uf_session';
const DAY = 24 * 60 * 60 * 1000;
export const SESSION_MS = 30 * DAY;
export const RENEW_BELOW_MS = 15 * DAY;
const ROUNDS = process.env.NODE_ENV === 'test' ? 4 : 12;

export const hashPassword = (pw) => bcrypt.hash(pw, ROUNDS);
export const verifyPassword = (pw, hash) => bcrypt.compare(pw, hash);

export function signSession(user, secret) {
  return jwt.sign({ sub: user.id, tv: user.token_version }, secret, { expiresIn: Math.floor(SESSION_MS / 1000) });
}

export function verifySession(token, secret) {
  try {
    return jwt.verify(token, secret);
  } catch {
    return null;
  }
}

export function cookieOptions(secure) {
  return { httpOnly: true, secure, sameSite: 'lax', maxAge: SESSION_MS, path: '/' };
}

// Sin caracteres ambiguos (0/O, 1/l/I) para dictarla por WhatsApp
const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generateTempPassword(length = 10) {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}
