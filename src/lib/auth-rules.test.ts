import { describe, expect, it } from "vitest";
import { guardRoute, isAdminMetadata, safeNext, type Viewer } from "./auth-rules";

const user: Viewer = { id: "u1", email: "amina@kilimo.co.ke", isAdmin: false };
const admin: Viewer = { id: "u2", email: "brian@appify.co.ke", isAdmin: true };

describe("isAdminMetadata", () => {
  it("is true only for role admin", () => {
    expect(isAdminMetadata({ role: "admin" })).toBe(true);
    expect(isAdminMetadata({ role: "business" })).toBe(false);
    expect(isAdminMetadata({})).toBe(false);
    expect(isAdminMetadata(null)).toBe(false);
    expect(isAdminMetadata("admin")).toBe(false);
  });
});

describe("guardRoute", () => {
  it("sends signed-out visitors of /app to sign-in, keeping where they were going", () => {
    expect(guardRoute("/app", "", null)).toEqual({ kind: "sign-in", next: "/app" });
    expect(guardRoute("/app/collect", "?x=1", null)).toEqual({
      kind: "sign-in",
      next: "/app/collect?x=1",
    });
  });

  it("lets signed-in users into /app", () => {
    expect(guardRoute("/app", "", user)).toEqual({ kind: "allow" });
  });

  it("hides /admin from everyone but admins", () => {
    expect(guardRoute("/admin", "", null)).toEqual({ kind: "not-found" });
    expect(guardRoute("/admin/kyb", "", user)).toEqual({ kind: "not-found" });
    expect(guardRoute("/admin/kyb", "", admin)).toEqual({ kind: "allow" });
  });

  it("leaves public pages alone, including lookalike paths", () => {
    expect(guardRoute("/", "", null)).toEqual({ kind: "allow" });
    expect(guardRoute("/apps", "", null)).toEqual({ kind: "allow" });
    expect(guardRoute("/administrator", "", null)).toEqual({ kind: "allow" });
  });
});

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/app/collect")).toBe("/app/collect");
  });

  it("refuses other sites", () => {
    expect(safeNext("https://evil.example")).toBe("/app");
    expect(safeNext("//evil.example")).toBe("/app");
    expect(safeNext("/\\evil.example")).toBe("/app");
    expect(safeNext(null)).toBe("/app");
  });
});
