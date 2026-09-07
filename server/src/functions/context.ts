// @ts-nocheck
// Shared context for ported Base44 backend functions.
// Replaces createClientFromRequest(req): provides the authed user, a service-role
// entity client (== base44.asServiceRole), and the parsed body.
import { serviceClient } from '../entities/service.js';

export function makeFnCtx(req) {
  return {
    user: req.user || null, // RlsUser | null
    svc: serviceClient(), // { entities } — service role (RLS bypassed)
    body: req.body || {},
    req,
  };
}

export function json(data, status = 200) {
  return { status, json: data };
}
