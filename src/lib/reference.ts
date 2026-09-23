// Our references look like MRD-7K3PQ2XA. The alphabet leaves out 0, O, 1 and I
// so a reference read out over the phone cannot be misheard.
export const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const REFERENCE_PATTERN = /^MRD-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

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
