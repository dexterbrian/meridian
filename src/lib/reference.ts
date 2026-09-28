// Our references look like MRD-7K3PQ2XA. The alphabet leaves out 0, O, 1 and I
// so a reference read out over the phone cannot be misheard.
//
// Three references hang off one payment request (TRD 2.5):
//   request  MRD-VNN6FG3X       one per payment request
//   attempt  MRD-VNN6FG3X-1     one per payment attempt, sent to Payaza as transaction_reference
//   payout   MRDP-VNN6FG3X-1    one per collected attempt, sent to Payaza Transfers
// The attempt number is base 36, so two characters cover 1,295 attempts and the
// attempt reference stays within Payaza's 15-character card limit.

export const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const REFERENCE_PATTERN = /^MRD-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;
export const ATTEMPT_REFERENCE_PATTERN =
  /^MRD-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}-[0-9A-Z]{1,2}$/;
export const PAYOUT_REFERENCE_PATTERN =
  /^MRDP-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}-[0-9A-Z]{1,2}$/;

/** Payaza's card reference limit. Attempt references must fit. */
export const PAYAZA_MAX_REFERENCE_LENGTH = 15;
/** The largest attempt number two base-36 characters can hold. */
export const MAX_ATTEMPTS = 36 * 36 - 1;

export function makeReference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let out = "";
  // 256 is a multiple of 32, so the modulo carries no bias.
  for (const b of bytes) out += REFERENCE_ALPHABET[b % REFERENCE_ALPHABET.length];
  return `MRD-${out}`;
}

export function isReference(value: string): boolean {
  return REFERENCE_PATTERN.test(value);
}

export function isAttemptReference(value: string): boolean {
  return ATTEMPT_REFERENCE_PATTERN.test(value);
}

export function isPayoutReference(value: string): boolean {
  return PAYOUT_REFERENCE_PATTERN.test(value);
}

/** MRD-VNN6FG3X + 1 -> MRD-VNN6FG3X-1; + 10 -> MRD-VNN6FG3X-A. */
export function attemptReference(requestReference: string, attemptNo: number): string {
  if (!isReference(requestReference)) throw new Error("Not a request reference");
  if (!Number.isInteger(attemptNo) || attemptNo < 1 || attemptNo > MAX_ATTEMPTS) {
    throw new Error(`Attempt number out of range: ${attemptNo}`);
  }
  return `${requestReference}-${attemptNo.toString(36).toUpperCase()}`;
}

/** MRD-VNN6FG3X-1 -> MRDP-VNN6FG3X-1. */
export function payoutReference(attemptRef: string): string {
  if (!isAttemptReference(attemptRef)) throw new Error("Not an attempt reference");
  return `MRDP-${attemptRef.slice(4)}`;
}

/** Split an attempt reference into the request reference and attempt number. */
export function parseAttemptReference(
  value: string,
): { requestReference: string; attemptNo: number } | null {
  if (!isAttemptReference(value)) return null;
  const requestReference = value.slice(0, 12);
  const attemptNo = parseInt(value.slice(13), 36);
  return { requestReference, attemptNo };
}
