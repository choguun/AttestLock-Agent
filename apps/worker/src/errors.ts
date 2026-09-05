export class RefusedError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'RefusedError';
  }
}

export class TransientError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'TransientError';
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Expected waiting is resumable work, not a failed proof-generation attempt. */
export class DeferredError extends Error {
  constructor(
    public readonly code: string,
    public readonly delayMs = 15_000
  ) {
    super('Waiting for a required chain observation.');
  }
}

export function publicRefusalMessage(code: string): string {
  const messages: Record<string, string> = {
    BORROWER_MISMATCH: 'The authorized wallet is not the borrower in the source lock.',
    WRONG_SOURCE_CONTRACT: 'The source transaction did not call the configured LockVault.',
    SOURCE_TRANSACTION_FAILED: 'The source transaction was not successful.',
    LOCK_TERM_TOO_SHORT: 'The collateral no longer has enough remaining lock time.',
    LOCK_ALREADY_USED: 'This collateral lock has already opened a credit line.',
    QUERY_ALREADY_PROCESSED: 'This proof query has already been processed.',
  };
  return (
    messages[code] ??
    'The transaction or proof did not satisfy the credit policy. No new line was opened by this job.'
  );
}
