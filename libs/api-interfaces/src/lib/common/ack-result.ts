export type AckResult<T> = { ok: true; data: T } | { ok: false; error: string };
