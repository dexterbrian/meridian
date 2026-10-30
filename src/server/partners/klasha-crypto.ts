import { createCipheriv, createDecipheriv } from "node:crypto";

// Klasha wants every request body sent as { message: encrypt(JSON) }. Its
// current ("new encryption") scheme is 3DES in CBC mode with PKCS#7 padding:
// the key is the first 24 characters of the merchant's encryption key, the IV
// its first 8, and the result is base64. From Klasha's docs
// (developers.klasha.com/accepting-payments/payments-api#encryption-algorithm).
// WebCrypto has no 3DES, so this uses Node's crypto.

function keyAndIv(secret: string) {
  const s = secret.trim();
  if (s.length < 24) throw new Error("Klasha's encryption key must be at least 24 characters.");
  return { key: Buffer.from(s.slice(0, 24), "utf8"), iv: Buffer.from(s.slice(0, 8), "utf8") };
}

/** Encrypts a request body the way Klasha expects. */
export async function klashaEncrypt(plaintext: string, secret: string): Promise<string> {
  const { key, iv } = keyAndIv(secret);
  const cipher = createCipheriv("des-ede3-cbc", key, iv);
  return Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]).toString("base64");
}

/** Reverses klashaEncrypt. */
export async function klashaDecrypt(payload: string, secret: string): Promise<string> {
  const { key, iv } = keyAndIv(secret);
  const decipher = createDecipheriv("des-ede3-cbc", key, iv);
  return Buffer.concat([decipher.update(payload, "base64"), decipher.final()]).toString("utf8");
}
