// Strips secrets and sensitive numbers from anything we store about a partner call.
// Rule from TRD section 9: keys named *key*, *secret*, *token*, *pin*, account_number, id_number.

const SENSITIVE = /key|secret|token|password|authorization|pin|^account_number$|^id_number$|^bvn$/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE.test(k) ? "[redacted]" : redact(v);
    }
    return out;
  }
  return value;
}
