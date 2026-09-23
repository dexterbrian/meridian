import { md5 } from "js-md5";

// Klasha wants every request body sent as { message: encrypt(JSON) }.
// The format is OpenSSL's "Salted__" AES-256-CBC, the same one CryptoJS.AES.encrypt
// produces from a passphrase. Key and IV come from EVP_BytesToKey (MD5, 1 round).
// WebCrypto has AES-CBC but no MD5, so MD5 comes from js-md5. This runs on
// Node and on Cloudflare Workers alike.

const SALT_PREFIX = new TextEncoder().encode("Salted__");

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** OpenSSL EVP_BytesToKey with MD5 and one iteration. Returns a 32-byte key and 16-byte IV. */
export function evpBytesToKey(passphrase: Uint8Array, salt: Uint8Array) {
  let derived = new Uint8Array(0);
  let block = new Uint8Array(0);
  while (derived.length < 48) {
    block = new Uint8Array(md5.arrayBuffer(concat(block, passphrase, salt)));
    derived = concat(derived, block);
  }
  return { key: derived.slice(0, 32), iv: derived.slice(32, 48) };
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function importKey(key: Uint8Array<ArrayBuffer>, usage: "encrypt" | "decrypt") {
  return crypto.subtle.importKey("raw", key, { name: "AES-CBC" }, false, [usage]);
}

/** Encrypt text in OpenSSL "Salted__" format. `salt` is only passed in tests. */
export async function klashaEncrypt(
  plaintext: string,
  passphrase: string,
  salt: Uint8Array<ArrayBuffer> = crypto.getRandomValues(new Uint8Array(8)),
): Promise<string> {
  const { key, iv } = evpBytesToKey(new TextEncoder().encode(passphrase), salt);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv: iv.slice() },
    await importKey(key.slice(), "encrypt"),
    new TextEncoder().encode(plaintext),
  );
  return toBase64(concat(SALT_PREFIX, salt, new Uint8Array(cipher)));
}

/** Decrypt an OpenSSL "Salted__" payload. */
export async function klashaDecrypt(payload: string, passphrase: string): Promise<string> {
  const raw = fromBase64(payload);
  const prefix = new TextDecoder().decode(raw.slice(0, 8));
  if (prefix !== "Salted__") throw new Error("Not an OpenSSL salted payload");
  const salt = raw.slice(8, 16);
  const { key, iv } = evpBytesToKey(new TextEncoder().encode(passphrase), salt);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv: iv.slice() },
    await importKey(key.slice(), "decrypt"),
    raw.slice(16),
  );
  return new TextDecoder().decode(plain);
}
