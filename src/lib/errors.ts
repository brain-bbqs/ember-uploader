export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function friendlyError(e: unknown): string {
  let msg = e instanceof Error ? e.message : String(e);
  if (e instanceof ApiError) {
    if (e.status === 401) msg = "Authentication failed: please sign in again.";
    else if (e.status === 403) msg = "Permission denied: your account cannot edit this dandiset.";
    else if (e.status === 404) msg = "Not found: check the dandiset ID (and that a draft version exists).";
  }
  return msg;
}
