import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, randomInt, type KeyObject } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { hash, verify } from '@node-rs/argon2';
import { SignJWT, exportJWK, jwtVerify, type JWTPayload } from 'jose';
import type { Config } from './config.js';

export interface Keys {
  privateKey: KeyObject;
  publicKey: KeyObject;
  publicPem: string;
  kid: string;
}

function parsePem(value: string): string {
  const v = value.trim();
  if (v.startsWith('-----BEGIN')) return v.replace(/\\n/g, '\n');
  return Buffer.from(v, 'base64').toString('utf8');
}

/** Charge la cle de signature Ed25519. En dev, en genere une et la garde dans .data/. */
export function loadKeys(config: Config): Keys {
  let pem = config.SIGNING_KEY ? parsePem(config.SIGNING_KEY) : undefined;
  if (!pem) {
    if (config.isProd) throw new Error('SIGNING_KEY est obligatoire en production');
    const file = '.data/signing-key.pem';
    if (existsSync(file)) {
      pem = readFileSync(file, 'utf8');
    } else {
      const { privateKey } = generateKeyPairSync('ed25519');
      pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, pem);
    }
  }
  const privateKey = createPrivateKey(pem);
  const publicKey = createPublicKey(privateKey);
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const kid = createHash('sha256').update(publicPem).digest('hex').slice(0, 16);
  return { privateKey, publicKey, publicPem, kid };
}

export async function publicJwk(keys: Keys) {
  const jwk = await exportJWK(keys.publicKey);
  return { ...jwk, alg: 'EdDSA', use: 'sig', kid: keys.kid };
}

export const hashPassword = (password: string) => hash(password);
export const verifyPassword = (hashed: string, password: string) => verify(hashed, password).catch(() => false);

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function newOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generatePassword(length = 14): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export const AUDIENCE_LAUNCHER = 'launcher';
export const ticketAudience = (slug: string) => `game:${slug}`;

export async function signToken(
  keys: Keys,
  config: Config,
  opts: { type: 'access' | 'ticket'; audience: string; subject: string; ttlSeconds: number; claims?: JWTPayload },
): Promise<string> {
  return new SignJWT({ ...opts.claims, tt: opts.type })
    .setProtectedHeader({ alg: 'EdDSA', kid: keys.kid, typ: 'JWT' })
    .setIssuer(config.PUBLIC_URL)
    .setAudience(opts.audience)
    .setSubject(opts.subject)
    .setIssuedAt()
    .setExpirationTime(`${opts.ttlSeconds}s`)
    .sign(keys.privateKey);
}

export async function verifyToken(keys: Keys, config: Config, token: string, audience: string, type: 'access' | 'ticket') {
  const { payload } = await jwtVerify(token, keys.publicKey, {
    issuer: config.PUBLIC_URL,
    audience,
    algorithms: ['EdDSA'],
  });
  if (payload['tt'] !== type) throw new Error('type de jeton invalide');
  return payload;
}
