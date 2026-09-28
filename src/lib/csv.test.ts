import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

const cols = [
  { key: "ref", label: "Reference" },
  { key: "amount", label: "Amount" },
  { key: "memo", label: "Memo" },
];

describe("toCsv", () => {
  it("writes a header and quoted cells", () => {
    const out = toCsv(cols, [{ ref: "MRD-VNN6FG3X", amount: 650000, memo: 'Roses, "grade A"' }]);
    expect(out).toBe('Reference,Amount,Memo\r\nMRD-VNN6FG3X,650000,"Roses, ""grade A"""\r\n');
  });

  it("neutralises formula injection", () => {
    const out = toCsv(cols, [{ ref: "=HYPERLINK(1)", amount: null, memo: "-1" }]);
    expect(out).toContain("'=HYPERLINK(1)");
    expect(out).toContain(",,'-1");
  });

  it("handles newlines inside a cell", () => {
    expect(toCsv(cols, [{ ref: "a", amount: 1, memo: "two\nlines" }])).toContain('"two\nlines"');
  });
});
