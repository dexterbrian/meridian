import { describe, expect, it } from "vitest";
import { klashaDecrypt, klashaEncrypt } from "./klasha-crypto";

// Vector made with the OpenSSL CLI, the same cipher Klasha's PHP sample uses:
//   printf '%s' "$PLAIN" | openssl enc -des-ede3-cbc -K <hex of the 24-char key> \
//     -iv <hex of its first 8 chars> -base64 -A
const PLAIN = '{"amount":1000,"currency":"CNY","reference":"MRD-7K3PQ2XA"}';
const KEY = "abcdefghijklmnopqrstuvwx";
const OPENSSL =
  "EEsjsHWCUWgbyMlAekQjEQzvDnYLzoYfCursUHV4l/J8k4ysDWjcAlDeUFQ1OY7JwKZQmW9rAwzJ3mvOM8L1Rg==";

describe("Klasha encryption (3DES)", () => {
  it("matches OpenSSL byte for byte", async () => {
    expect(await klashaEncrypt(PLAIN, KEY)).toBe(OPENSSL);
  });

  it("uses only the first 24 characters of a longer key", async () => {
    expect(await klashaEncrypt(PLAIN, `${KEY}EXTRA/CHARS=`)).toBe(OPENSSL);
  });

  it("decrypts what OpenSSL made", async () => {
    expect(await klashaDecrypt(OPENSSL, KEY)).toBe(PLAIN);
  });

  it("refuses a key too short for 3DES", async () => {
    await expect(klashaEncrypt(PLAIN, "short")).rejects.toThrow(/24 characters/);
  });
});
