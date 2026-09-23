import { describe, expect, it } from "vitest";
import { klashaDecrypt, klashaEncrypt } from "./klasha-crypto";

// Vectors made with the OpenSSL CLI:
//   printf '%s' "$PLAIN" | openssl enc -aes-256-cbc -md md5 -S 0102030405060708 -pass pass:klasha-test-key -base64 -A
//   printf '%s' 'hello' | openssl enc -aes-256-cbc -md md5 -pass pass:another-key -base64 -A
const PLAIN = '{"amount":1000,"currency":"CNY","reference":"MRD-7K3PQ2XA"}';
const SALT = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
// With an explicit -S, OpenSSL 3 omits the "Salted__" header, so the test adds it back.
const OPENSSL_BODY =
  "antNtwjO2Kma4fLWtluRcWS+v7hs0PwgAw6tth3exQWFihJpjFP2qOl3fA6ww8LAIeO1sjCyVaUK/L3xNlQJQA==";
const OPENSSL_SALTED = "U2FsdGVkX1+Lj7CtnDTbRDL4Eh6Y2P0HtCCl7IqtBCU=";

function withHeader(body: string, salt: Uint8Array) {
  const bytes = Buffer.concat([
    Buffer.from("Salted__"),
    Buffer.from(salt),
    Buffer.from(body, "base64"),
  ]);
  return bytes.toString("base64");
}

describe("Klasha encryption", () => {
  it("matches OpenSSL byte for byte for a fixed salt", async () => {
    expect(await klashaEncrypt(PLAIN, "klasha-test-key", SALT)).toBe(
      withHeader(OPENSSL_BODY, SALT),
    );
  });

  it("decrypts a payload OpenSSL made", async () => {
    expect(await klashaDecrypt(OPENSSL_SALTED, "another-key")).toBe("hello");
  });

  it("round-trips with a random salt", async () => {
    const payload = await klashaEncrypt(PLAIN, "secret");
    expect(payload.startsWith("U2FsdGVkX1")).toBe(true);
    expect(await klashaDecrypt(payload, "secret")).toBe(PLAIN);
  });

  it("fails with the wrong passphrase", async () => {
    const payload = await klashaEncrypt(PLAIN, "secret");
    await expect(klashaDecrypt(payload, "wrong")).rejects.toThrow();
  });
});
