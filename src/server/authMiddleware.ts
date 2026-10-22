/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import express from 'express';

export interface EmbedSessionClaims {
  storeId: string;
  userId?: string | number;
  userName?: string;
  companyId?: string | number;
  companyName?: string;
  issuedAt: number;
  expiresAt: number;
  jti: string;
}

export class AuthManager {
  private secret: string;
  private adminApiKey: string;
  private sessionTtlSec: number;

  constructor(secret: string = '', adminApiKey: string = '', sessionTtlSec: number = 1800) {
    this.sessionTtlSec = sessionTtlSec; // 30 minutes default
    this.secret = secret || process.env.EWITY_SIGNING_SECRET || process.env.EWITY_WEBHOOK_SECRET || this.getOrCreateFallbackSecret('session_secret.key');
    this.adminApiKey = adminApiKey || process.env.ADMIN_API_KEY || this.getOrCreateFallbackSecret('admin_key.secret');
  }

  private getOrCreateFallbackSecret(filename: string): string {
    const dataDir = path.resolve('.data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const secretPath = path.join(dataDir, filename);
    if (fs.existsSync(secretPath)) {
      try {
        const key = fs.readFileSync(secretPath, 'utf-8').trim();
        if (key.length >= 16) return key;
      } catch {
        // Fall back to new key
      }
    }
    const newSecret = crypto.randomBytes(32).toString('hex');
    try {
      fs.writeFileSync(secretPath, newSecret, { encoding: 'utf-8', mode: 0o600 });
    } catch {
      // Ignore
    }
    return newSecret;
  }

  public setSecret(secret: string) {
    if (secret && secret.trim()) {
      this.secret = secret;
    }
  }

  public setAdminApiKey(key: string) {
    if (key && key.trim()) {
      this.adminApiKey = key;
    }
  }

  public getAdminApiKey(): string {
    return this.adminApiKey;
  }

  /**
   * Generates a signed embed session token bound to the verified store and user
   */
  public createEmbedSession(params: {
    storeId: string;
    userId?: string | number;
    userName?: string;
    companyId?: string | number;
    companyName?: string;
  }): string {
    const now = Math.floor(Date.now() / 1000);
    const claims: EmbedSessionClaims = {
      storeId: params.storeId,
      userId: params.userId,
      userName: params.userName,
      companyId: params.companyId,
      companyName: params.companyName,
      issuedAt: now,
      expiresAt: now + this.sessionTtlSec,
      jti: `sess_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`,
    };

    const payloadStr = JSON.stringify(claims);
    const payloadB64 = Buffer.from(payloadStr, 'utf8').toString('base64url');
    const signature = crypto.createHmac('sha256', this.secret).update(payloadB64).digest('base64url');

    return `ewity_sess_${payloadB64}.${signature}`;
  }

  /**
   * Verifies an embed session token
   */
  public verifyEmbedSession(token: string): { isValid: boolean; claims?: EmbedSessionClaims; reason?: string } {
    if (!token || !token.startsWith('ewity_sess_')) {
      return { isValid: false, reason: 'Malformed or missing session prefix' };
    }

    const raw = token.slice('ewity_sess_'.length);
    const dotIdx = raw.lastIndexOf('.');
    if (dotIdx === -1) {
      return { isValid: false, reason: 'Invalid session token format' };
    }

    const payloadB64 = raw.slice(0, dotIdx);
    const signatureB64 = raw.slice(dotIdx + 1);

    const expectedSig = crypto.createHmac('sha256', this.secret).update(payloadB64).digest('base64url');

    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    const receivedBuf = Buffer.from(signatureB64, 'utf8');

    if (expectedBuf.length !== receivedBuf.length || !crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
      return { isValid: false, reason: 'Session token signature mismatch' };
    }

    try {
      const claimsStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
      const claims: EmbedSessionClaims = JSON.parse(claimsStr);

      const now = Math.floor(Date.now() / 1000);
      if (claims.expiresAt && claims.expiresAt < now) {
        return { isValid: false, reason: 'Session token has expired' };
      }

      if (!claims.storeId) {
        return { isValid: false, reason: 'Session token missing storeId' };
      }

      return { isValid: true, claims };
    } catch {
      return { isValid: false, reason: 'Failed to decode session payload' };
    }
  }

  /**
   * Verifies whether an incoming bearer or header token matches the configured admin key
   */
  public verifyAdminKey(token: string | undefined): boolean {
    if (!token || !this.adminApiKey) return false;
    const cleanToken = token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim();
    if (!cleanToken || cleanToken.length !== this.adminApiKey.length) return false;
    return crypto.timingSafeEqual(Buffer.from(cleanToken, 'utf8'), Buffer.from(this.adminApiKey, 'utf8'));
  }
}

/**
 * Creates authentication middlewares for Express routes
 */
export function createAuthMiddlewares(authManager: AuthManager, getTargetStoreId: () => string) {
  /**
   * Extract bearer token from Authorization header or custom header or query
   */
  function extractAuthToken(req: express.Request): string | undefined {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }
    const sessHeader = req.headers['x-ewity-session'];
    if (typeof sessHeader === 'string' && sessHeader.trim()) {
      return sessHeader.trim();
    }
    const adminHeader = req.headers['x-admin-key'];
    if (typeof adminHeader === 'string' && adminHeader.trim()) {
      return adminHeader.trim();
    }
    if (typeof req.query.session === 'string') {
      return req.query.session;
    }
    if (typeof req.query.embed_token === 'string') {
      return req.query.embed_token;
    }
    if (req.body && typeof req.body.adminApiKey === 'string' && req.body.adminApiKey.trim()) {
      return req.body.adminApiKey.trim();
    }
    return undefined;
  }

  /**
   * Middleware: Require Administrator privileges
   */
  const requireAdminAuth: express.RequestHandler = (req, res, next) => {
    const token = extractAuthToken(req);
    if (!token) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Administrator authentication required. Provide Authorization: Bearer <ADMIN_API_KEY> or X-Admin-Key.',
      });
    }

    if (authManager.verifyAdminKey(token)) {
      (req as any).isAdmin = true;
      return next();
    }

    // Also accept valid embed sessions as authorized merchant operations
    const sessionResult = authManager.verifyEmbedSession(token);
    if (sessionResult.isValid && sessionResult.claims) {
      (req as any).isEmbedSession = true;
      (req as any).embedClaims = sessionResult.claims;
      (req as any).authorizedStoreId = sessionResult.claims.storeId;
      return next();
    }

    return res.status(403).json({
      error: 'forbidden',
      message: 'Invalid administrator credentials.',
    });
  };

  /**
   * Middleware: Require either Admin Key or verified Embed Session
   * Enforces tenant isolation against configured store ID!
   */
  const requireAuthOrEmbedSession: express.RequestHandler = (req, res, next) => {
    const isProd = process.env.NODE_ENV === 'production';
    const token = extractAuthToken(req);

    // 1. Check if token is Admin Key
    if (token && authManager.verifyAdminKey(token)) {
      (req as any).isAdmin = true;
      (req as any).authorizedStoreId = getTargetStoreId() || 'default';
      return next();
    }

    // 2. Check if token is valid Embed Session
    if (token) {
      const sessionResult = authManager.verifyEmbedSession(token);
      if (sessionResult.isValid && sessionResult.claims) {
        const tokenStoreId = sessionResult.claims.storeId;
        const configuredStoreId = getTargetStoreId();

        // Enforce tenant isolation: if server is configured for a specific store, verify match
        if (configuredStoreId && tokenStoreId !== configuredStoreId) {
          return res.status(403).json({
            error: 'tenant_mismatch',
            message: `Cross-tenant access forbidden. Token store ${tokenStoreId} does not match configured store.`,
          });
        }

        (req as any).isEmbedSession = true;
        (req as any).embedClaims = sessionResult.claims;
        (req as any).authorizedStoreId = tokenStoreId;
        return next();
      }
    }

    // 3. In non-production development mode, allow read-only access for developer UI preview
    if (!isProd && req.method === 'GET' && req.path === '/api/ewity/status') {
      (req as any).authorizedStoreId = getTargetStoreId() || 'default';
      return next();
    }

    return res.status(401).json({
      error: 'unauthorized',
      message: 'Access denied. Valid embed session or administrator key required.',
    });
  };

  return {
    requireAdminAuth,
    requireAuthOrEmbedSession,
    extractAuthToken,
  };
}
