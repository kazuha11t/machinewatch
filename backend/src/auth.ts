import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { NextFunction, Request, Response } from 'express';
import { jwtVerify, SignJWT } from 'jose';

const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keyLength: number) => Promise<Buffer>;
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

export interface TokenPayload {
  userId: number;
  email: string;
}

export class TokenService {
  readonly #key: Uint8Array;
  readonly #expiresIn: string;

  constructor(secret: string, expiresIn: string) {
    this.#key = new TextEncoder().encode(secret);
    this.#expiresIn = expiresIn;
  }

  sign(payload: TokenPayload): Promise<string> {
    return new SignJWT({ email: payload.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(String(payload.userId))
      .setIssuedAt()
      .setExpirationTime(this.#expiresIn)
      .sign(this.#key);
  }

  async verify(token: string): Promise<TokenPayload | null> {
    try {
      const { payload } = await jwtVerify(token, this.#key, { algorithms: ['HS256'] });
      const userId = Number(payload.sub);
      if (!Number.isInteger(userId) || typeof payload.email !== 'string') return null;
      return { userId, email: payload.email };
    } catch {
      return null;
    }
  }
}

export function requireAuth(tokens: TokenService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization;
    const payload = header?.startsWith('Bearer ') ? await tokens.verify(header.slice('Bearer '.length)) : null;
    if (!payload) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    res.locals.user = payload;
    next();
  };
}

export function currentUser(res: Response): TokenPayload {
  return res.locals.user as TokenPayload;
}
