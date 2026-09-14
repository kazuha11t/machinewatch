import type { NextFunction, Request, Response } from 'express';

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} not found`);

/** `*` allows any origin; otherwise a comma-separated allow-list. */
export function parseCorsOrigin(value: string): string | string[] {
  return value === '*' ? '*' : value.split(',').map((origin) => origin.trim());
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'Request body is not valid JSON' });
    return;
  }
  console.error('[http] unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
}

type Body = Record<string, unknown>;

export function asObject(value: unknown): Body {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'Request body must be a JSON object');
  }
  return value as Body;
}

export function readString(body: Body, key: string, { required = false, maxLength = 200 } = {}): string | undefined {
  const value = body[key];
  if (value === undefined) {
    if (required) throw new HttpError(400, `"${key}" is required`);
    return undefined;
  }
  if (typeof value !== 'string') throw new HttpError(400, `"${key}" must be a string`);
  const trimmed = value.trim();
  if (required && trimmed === '') throw new HttpError(400, `"${key}" cannot be empty`);
  if (trimmed.length > maxLength) throw new HttpError(400, `"${key}" must be at most ${maxLength} characters`);
  return trimmed;
}

export function readNumber(
  body: Body,
  key: string,
  { required = false, min = -Infinity, max = Infinity, integer = false } = {},
): number | undefined {
  const value = body[key];
  if (value === undefined) {
    if (required) throw new HttpError(400, `"${key}" is required`);
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new HttpError(400, `"${key}" must be a number`);
  if (integer && !Number.isInteger(value)) throw new HttpError(400, `"${key}" must be an integer`);
  if (value < min || value > max) throw new HttpError(400, `"${key}" must be between ${min} and ${max}`);
  return value;
}

export function readBoolean(body: Body, key: string, { required = false } = {}): boolean | undefined {
  const value = body[key];
  if (value === undefined) {
    if (required) throw new HttpError(400, `"${key}" is required`);
    return undefined;
  }
  if (typeof value !== 'boolean') throw new HttpError(400, `"${key}" must be true or false`);
  return value;
}

export function readEnum<T extends string>(body: Body, key: string, allowed: readonly T[], { required = false } = {}): T | undefined {
  const value = body[key];
  if (value === undefined) {
    if (required) throw new HttpError(400, `"${key}" is required`);
    return undefined;
  }
  if (!allowed.includes(value as T)) throw new HttpError(400, `"${key}" must be one of: ${allowed.join(', ')}`);
  return value as T;
}

export function queryInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new HttpError(400, `Query parameter "${name}" must be an integer`);
  return parsed;
}

export function pathInt(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new HttpError(400, `"${name}" must be a positive integer`);
  return parsed;
}
