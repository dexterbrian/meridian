// Meridian investor deck — built strictly on the HackHouse/Mizani template format
// (same 12-slide arc, same geometry, same component vocabulary), in Meridian's colours.
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const Lu = require("react-icons/lu");

// ---- Meridian palette, mapped onto the template's colour roles -------------
const C = {
  dark: "0F2624", // was 0A1E2D  deep teal
  darkCard: "1B3B38", // was 13293C
  darkCardLine: "2C544F", // was 2A4257
  light: "EFF5F2", // was F7F2E9  page background
  cream: "F2F7F4", // was F2EFE7  text on dark
  white: "FFFFFF",
  mutedDark: "9FB8B2", // was 9DB0BC  muted on dark
  mutedLight: "4F6B66", // was 5E6E7B  muted on light (darkened for contrast)
  accent: "3ECFA0", // was FF9114  mint
  accentDeep: "12705A", // was B85E00  accent text on light
  gold: "E5C158", // second accent, used sparingly
  border: "D7E4DF", // was E4DBC9
  mid: "7FA39C", // was 8FA3B0
  tintAccent: "E6F7F0", // was FFF3E2
  ink: "0B1A19", // ring inside the Meridian mark
};
const F = "Calibri";
const OUT = process.argv[2] || "meridian-investor-deck.pptx";
const TOTAL = 12;

// ---- icon rendering --------------------------------------------------------
const iconCache = new Map();
async function icon(names, color, size = 256) {
  const list = Array.isArray(names) ? names : [names];
  const name = list.find((n) => Lu[n]);
  if (!name) throw new Error("no icon among " + list.join(","));
  const key = name + color;
  if (iconCache.has(key)) return iconCache.get(key);
  const svg = ReactDOMServer.renderToStaticMarkup(
    React.createElement(Lu[name], { color: "#" + color, size, strokeWidth: 1.9 }),
  );
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const data = "image/png;base64," + png.toString("base64");
  iconCache.set(key, data);
  return data;
}

const pres = new pptxgen();
pres.defineLayout({ name: "TPL", width: 13.333, height: 7.5 });
pres.layout = "TPL";
pres.author = "Appify Softwares Limited";
pres.company = "Appify Softwares Limited";
pres.title = "Meridian — Investor Deck";

// ---- primitives ------------------------------------------------------------
// Template convention: zero text insets, middle anchor, bold.
function T(s, text, x, y, w, h, o = {}) {
  s.addText(text, {
    x, y, w, h,
    fontFace: F,
    fontSize: o.size || 12.5,
    color: o.color || C.mutedLight,
    bold: o.bold !== false,
    italic: !!o.italic,
    align: o.align || "left",
    valign: o.valign || "middle",
    isTextBox: true,
    margin: 0,
    lineSpacingMultiple: o.lsm,
    charSpacing: o.spc,
    shrinkText: false,
  });
}

function shape(s, kind, x, y, w, h, o = {}) {
  const opt = { x, y, w, h };
  opt.fill = o.fill ? { color: o.fill } : { type: "none" };
  if (o.line) opt.line = { color: o.line, width: o.lineW || 1 };
  else opt.line = { type: "none" };
  if (kind === "roundRect") opt.rectRadius = o.r != null ? o.r : 0.13;
  s.addShape(kind === "roundRect" ? pres.shapes.ROUNDED_RECTANGLE : kind === "ellipse" ? pres.shapes.OVAL : pres.shapes.RECTANGLE, opt);
}

function card(s, x, y, w, h, o = {}) {
  shape(s, "roundRect", x, y, w, h, {
    fill: o.fill || C.white,
    line: o.line === null ? null : o.line || C.border,
    r: o.r != null ? o.r : 0.13,
  });
}

// pill: fully rounded, text centred on top (template draws shape then text 0.02 higher)
function pill(s, text, x, y, w, h, o = {}) {
  shape(s, "roundRect", x, y, w, h, { fill: o.fill, line: o.line, r: h / 2 });
  T(s, text, x, y - 0.02, w, h, { size: o.size || 9, color: o.color, align: "ctr" });
}

async function iconDisc(s, names, cx, cy, d, o = {}) {
  shape(s, "ellipse", cx, cy, d, d, { fill: o.fill || C.white, line: o.line === null ? null : o.line || C.border });
  const id = d * 0.485;
  s.addImage({ data: await icon(names, o.iconColor || C.dark), x: cx + (d - id) / 2, y: cy + (d - id) / 2, w: id, h: id });
}

// Meridian mark: the mint tile with an ink-ringed dot, same proportions as the pitch deck.
function mark(s, x, y, d) {
  shape(s, "roundRect", x, y, d, d, { fill: C.accent, line: C.accent, r: d * 0.218 });
  const id = d * 0.436;
  s.addShape(pres.shapes.OVAL, {
    x: x + (d - id) / 2, y: y + (d - id) / 2, w: id, h: id,
    fill: { color: C.accent },
    line: { color: C.ink, width: Math.max(0.75, d * 3.64) },
  });
}

function chrome(s, n, o = {}) {
  const muted = o.dark ? C.mutedDark : C.mutedLight;
  T(s, o.eyebrow, 0.7, 0.56, 11.93, 0.3, { size: 11, color: muted, spc: 60 });
  s.addText(o.title, {
    x: 0.7, y: 0.95, w: 11.93, h: 1.35,
    fontFace: F, fontSize: 30, bold: true,
    color: o.dark ? C.cream : C.dark,
    valign: "top", isTextBox: true, margin: 0, lineSpacingMultiple: 1.04,
  });
  mark(s, 0.7, 6.98, 0.3);
  T(s, "MERIDIAN · APPIFY SOFTWARES", 1.1, 7.0, 3.6, 0.26, { size: 8, color: muted, spc: 40 });
  T(s, `PROJECTIONS ILLUSTRATIVE · ${String(n).padStart(2, "0")} / ${TOTAL}`, 8.13, 7.0, 4.5, 0.26, {
    size: 8, color: muted, align: "right", spc: 40,
  });
}

function slide(dark) {
  const s = pres.addSlide();
  s.background = { color: dark ? C.dark : C.light };
  return s;
}

// ---------------------------------------------------------------- build -----
(async () => {
  // ============================================================ 1 · TITLE
  {
    const s = slide(true);
    mark(s, 0.7, 0.46, 0.62);
    pill(s, "PRE-SEED", 10.98, 0.56, 1.65, 0.42, { fill: C.dark, line: C.accent, color: C.accent, size: 9.5 });

    s.addText(
      [
        { text: "Meridian", options: { color: C.cream } },
        { text: ".", options: { color: C.accent } },
      ],
      { x: 0.7, y: 2.05, w: 7.4, h: 1.65, fontFace: F, fontSize: 84, bold: true, valign: "middle", isTextBox: true, margin: 0 },
    );
    T(s, "Cross-border payments for African importers and exporters. Money lands in minutes, for a flat 1% and no FX markup.",
      0.7, 3.95, 7.1, 1.5, { size: 21, color: C.cream, lsm: 1.25, valign: "top" });
    T(s, "Brian Waweru, Founder   ·   Nairobi   ·   brian@appify.co.ke", 0.7, 5.55, 7.1, 0.35, { size: 12.5, color: C.mutedDark });

    // designed panel (template photo slot)
    card(s, 8.3, 1.55, 4.33, 4.6, { fill: C.darkCard, line: C.darkCardLine, r: 0.14 });
    T(s, "SAMPLE TRANSFER", 8.62, 1.86, 3.7, 0.26, { size: 9.5, color: C.mutedDark, spc: 60 });
    T(s, "Nairobi — you send", 8.62, 2.2, 3.7, 0.24, { size: 9.5, color: C.mutedDark });
    T(s, "KSh 1,500,000", 8.62, 2.46, 3.7, 0.5, { size: 25, color: C.cream });
    shape(s, "rect", 8.64, 3.08, 0.02, 0.86, { fill: C.accent });
    T(s, "Compliance cleared\nConverted by our licensed partner\nPayout sent to the supplier's bank",
      8.86, 3.06, 3.5, 0.9, { size: 9.5, color: C.mutedDark, lsm: 1.35, valign: "top" });
    card(s, 8.62, 4.12, 3.7, 0.95, { fill: C.dark, line: C.accent, r: 0.09 });
    T(s, "Shenzhen — supplier receives", 8.78, 4.24, 3.4, 0.24, { size: 9, color: C.mutedDark });
    T(s, "¥ 82,400", 8.78, 4.5, 3.4, 0.45, { size: 23, color: C.accent });
    T(s, "Total cost 2%. A bank takes 8 to 10%.", 8.62, 5.28, 3.7, 0.26, { size: 9.5, color: C.mutedDark });
    T(s, "Nairobi to Shenzhen, our first corridor", 8.3, 6.26, 4.33, 0.28, { size: 9.5, color: C.mutedDark });

    T(s, "Pre-revenue. Volumes and costs come from five customer interviews; pricing from our partners' published rates.",
      0.7, 6.95, 8.6, 0.32, { size: 10, color: C.mutedDark });
    s.addText(
      [
        { text: "Appify", options: { color: C.cream } },
        { text: ".", options: { color: C.accent } },
      ],
      { x: 10.43, y: 6.92, w: 2.2, h: 0.38, fontFace: F, fontSize: 13, bold: true, align: "right", valign: "middle", isTextBox: true, margin: 0 },
    );
    s.addNotes(
      "HOOK (~15s): I'm Brian Waweru, founder of Meridian. Kenyan businesses that import and export wait four to five days and pay eight to ten percent to move money across a border. We make that minutes, for a flat one percent, with no markup on the rate. Here is what that costs them today.",
    );
  }

  // ============================================================ 2 · PROBLEM
  {
    const s = slide(false);
    chrome(s, 2, { eyebrow: "02 · PROBLEM", title: "Kenyan importers lose a week and 9% on every supplier payment." });

    const rows = [
      ["LuClock", "4 to 5 days to confirm", "and the factory will not start the order until it lands."],
      ["LuTrendingDown", "8 to 10% all-in", "bank fees plus a poor rate on a shilling account."],
      [["LuPlane", "LuPlaneTakeoff"], "Buyers cannot pay you", "a South Sudan customer flew to Nairobi to pay in cash."],
    ];
    let y = 2.52;
    for (const [ic, head, subv] of rows) {
      await iconDisc(s, ic, 0.7, y, 0.66);
      T(s, head, 1.62, y - 0.04, 5.9, 0.34, { size: 15.5, color: C.dark });
      T(s, subv, 1.62, y + 0.3, 5.9, 0.34, { size: 12.5, color: C.mutedLight });
      y += 1.08;
    }

    // designed panel (template photo strip)
    card(s, 0.7, 5.48, 6.58, 1.32, { r: 0.12 });
    T(s, "SAME PAYMENT, TWO ROUTES", 0.95, 5.6, 4.0, 0.2, { size: 8.5, color: C.mutedLight, spc: 60 });
    T(s, "Your bank", 0.95, 5.86, 1.3, 0.24, { size: 9.5, color: C.dark });
    shape(s, "rect", 2.35, 5.91, 3.3, 0.15, { fill: C.mid });
    T(s, "4 to 5 days", 5.8, 5.86, 1.4, 0.24, { size: 9.5, color: C.mutedLight });
    T(s, "Meridian", 0.95, 6.2, 1.3, 0.24, { size: 9.5, color: C.dark });
    shape(s, "rect", 2.35, 6.25, 0.3, 0.15, { fill: C.accent });
    T(s, "Minutes", 2.78, 6.2, 1.6, 0.24, { size: 9.5, color: C.accentDeep });
    T(s, "KES 1.5M, Nairobi to Shenzhen. Bank timing reported by interviewees.", 0.95, 6.5, 5.9, 0.2, { size: 8.5, color: C.mutedLight });

    // big number panel
    card(s, 7.85, 2.45, 4.78, 4.35, { fill: C.dark, line: null, r: 0.14 });
    T(s, "THE COST OF WAITING", 8.25, 2.85, 4.0, 0.3, { size: 10, color: C.mutedDark, spc: 60 });
    T(s, "200,000", 8.25, 3.15, 4.0, 1.6, { size: 74, color: C.accent });
    T(s, "KES lost per importer, every month", 8.25, 5.15, 4.0, 0.35, { size: 15, color: C.cream });
    T(s, "*On KES 2M monthly volume at 8–10%, the range importers reported to us.", 8.25, 5.95, 4.0, 0.45, { size: 9.5, color: C.mutedDark, lsm: 1.2, valign: "top" });

    s.addNotes(
      "(~30s): A hardware importer moving two million shillings a month loses between a hundred sixty and two hundred thousand of it to fees and a bad rate. That is the visible cost. The expensive one is time: the factory has a fourteen-day lead time and will not start until payment confirms, so a five-day bank delay becomes a stockout. And it runs both ways — exporters tell us foreign buyers simply cannot pay them.",
    );
  }

  // ============================================================ 3 · SOLUTION
  {
    const s = slide(false);
    chrome(s, 3, { eyebrow: "03 · SOLUTION", title: "Meridian: one screen, supplier paid the same day." });

    const cards = [
      ["LuLandmark", "TODAY", "Bank transfer", "Familiar, but four to five days and eight to ten percent.", false],
      [["LuMonitorSmartphone", "LuSmartphone"], "STEP 1", "One screen", "Pick the supplier, see the full cost, pay from M-Pesa or bank.", false],
      [["LuCircleCheckBig", "LuCheckCircle"], "PAYOFF", "Settled today", "Local currency in their account. Receipts to both sides.", true],
    ];
    const xs = [0.7, 4.85, 9.0];
    for (let i = 0; i < 3; i++) {
      const [ic, label, head, body, hot] = cards[i];
      const x = xs[i];
      card(s, x, 2.5, 3.62, 2.76, { r: 0.12 });
      await iconDisc(s, ic, x + 0.32, 2.84, 0.72, {
        fill: hot ? C.dark : C.light,
        line: hot ? C.dark : C.border,
        iconColor: hot ? C.accent : C.dark,
      });
      T(s, label, x + 0.32, 3.74, 2.98, 0.26, { size: 9, color: C.mutedLight, spc: 70 });
      T(s, head, x + 0.32, 4.0, 2.98, 0.36, { size: 16.5, color: C.dark });
      T(s, body, x + 0.32, 4.4, 2.98, 0.62, { size: 12.5, color: C.mutedLight, lsm: 1.2, valign: "top" });
    }
    T(s, "→", 4.42, 3.56, 0.4, 0.45, { size: 22, color: C.mutedLight, align: "ctr" });
    T(s, "→", 8.56, 3.56, 0.4, 0.45, { size: 22, color: C.mutedLight, align: "ctr" });

    s.addText(
      [
        { text: "WHY NOW: ", options: { fontSize: 12, color: C.dark, charSpacing: 60 } },
        { text: "partners now reach Africa, China and global wires through one API, and stablecoin settlement is regulated.", options: { fontSize: 14.5, color: C.dark } },
      ],
      { x: 0.7, y: 5.65, w: 11.93, h: 0.45, fontFace: F, bold: true, valign: "middle", isTextBox: true, margin: 0 },
    );
    T(s, "The rails exist. Meridian is the business layer on top of them.", 0.7, 6.14, 11.93, 0.34, { size: 12.5, color: C.mutedLight });

    s.addNotes(
      "(~30s): The fix is not a new rail. Rails now exist: Kotani Pay reaches mobile money and banks across Africa, Klasha reaches China and global wires. What does not exist is the business layer — one screen where a Kenyan importer picks a supplier, sees the true cost before confirming, and pays from the M-Pesa account they already use. That is Meridian.",
    );
  }

  // ============================================================ 4 · PRODUCT
  {
    const s = slide(false);
    chrome(s, 4, { eyebrow: "04 · PRODUCT", title: "Send. Collect. Clear." });

    const rows = [
      ["LuSend", "Send", "·  Pay a supplier in China, Dubai or Accra. Full cost shown first."],
      ["LuLink", "Collect", "·  A payment link, or our checkout embedded on your own site."],
      ["LuShieldCheck", "Clear", "·  KYB in a day. Sanctions and AML checks on every payment."],
    ];
    let y = 2.55;
    for (const [ic, head, body] of rows) {
      await iconDisc(s, ic, 0.7, y, 0.66);
      s.addText(
        [
          { text: head + "  ", options: { fontSize: 15.5, color: C.dark } },
          { text: body, options: { fontSize: 13, color: C.mutedLight } },
        ],
        { x: 1.62, y: y + 0.12, w: 7.1, h: 0.44, fontFace: F, bold: true, valign: "middle", isTextBox: true, margin: 0, lineSpacingMultiple: 1.15 },
      );
      y += 1.16;
    }
    pill(s, "DEMOS LIVE · CHECKOUT · SEND · PAYMENT LINK", 0.7, 6.15, 3.85, 0.44, { fill: C.white, line: C.border, color: C.dark });
    pill(s, "NEXT · LIVE RAILS", 4.75, 6.15, 1.95, 0.44, { fill: C.dark, line: C.dark, color: C.cream });

    // phone mock
    card(s, 9.55, 1.6, 3.08, 5.2, { fill: C.dark, line: null, r: 0.3 });
    card(s, 9.69, 1.77, 2.80, 4.86, { fill: C.white, line: null, r: 0.2 });
    s.addText(
      [
        { text: "Meridian", options: { color: C.dark } },
        { text: ".", options: { color: C.accent } },
      ],
      { x: 9.86, y: 1.96, w: 2.43, h: 0.3, fontFace: F, fontSize: 12, bold: true, valign: "middle", isTextBox: true, margin: 0 },
    );
    const mock = [
      [2.42, "Transfer settled", "¥82,400 to Shenzhen Tools"],
      [3.28, "Cost shown first", "Partner 1.5% + Meridian 1%"],
    ];
    for (const [my, a, b] of mock) {
      card(s, 9.86, my, 2.43, 0.72, { fill: C.light, line: null, r: 0.09 });
      s.addText(
        [
          { text: a, options: { fontSize: 10, color: C.dark, breakLine: true } },
          { text: b, options: { fontSize: 8.5, color: C.mutedLight } },
        ],
        { x: 10.0, y: my + 0.08, w: 2.15, h: 0.58, fontFace: F, bold: true, valign: "middle", isTextBox: true, margin: 0, lineSpacingMultiple: 1.3 },
      );
    }
    card(s, 9.86, 4.14, 2.43, 0.98, { fill: C.accent, line: null, r: 0.09 });
    s.addText(
      [
        { text: "SETTLED IN", options: { fontSize: 8.5, color: C.dark, charSpacing: 60, breakLine: true } },
        { text: "4 min", options: { fontSize: 26, color: C.dark } },
      ],
      { x: 10.0, y: 4.22, w: 2.15, h: 0.86, fontFace: F, bold: true, valign: "middle", isTextBox: true, margin: 0, lineSpacingMultiple: 1.1 },
    );
    T(s, "receipt sent to both sides", 9.86, 5.26, 2.43, 0.3, { size: 8.5, color: C.mutedLight });
    shape(s, "roundRect", 10.79, 6.44, 0.6, 0.06, { fill: C.border, r: 0.03 });

    s.addNotes(
      "(~40s): Three things. Send: pick a saved supplier, see the partner fee, our one percent, and exactly what they receive, then pay in from M-Pesa or your bank. Collect: a link you send, or our checkout embedded on your own site with one script tag, so a buyer in Hamburg can pay you. Clear: tiered business verification in a day rather than weeks, and sanctions and AML checks on every single payment. All three flows are demoable today against partner sandboxes; live rails are next.",
    );
  }

  // ============================================================ 5 · MARKET
  {
    const s = slide(false);
    chrome(s, 5, { eyebrow: "05 · MARKET", title: "500 Kenyan trading businesses: our first wedge." });

    const bars = [
      { bx: 0.9, tx: 0.7, y: 2.65, h: 3.35, fill: C.dark, val: "$260M", lbl: "TAM", sub: "Kenya cross-border\ngoods trade, at 1%*", valColor: C.dark },
      { bx: 3.1, tx: 2.9, y: 4.0, h: 2.0, fill: C.mid, val: "$40M", lbl: "SAM", sub: "SME trade inside our\npartners' corridors*", valColor: C.dark },
      { bx: 5.3, tx: 5.1, y: 5.15, h: 0.85, fill: C.gold, val: "$700K/yr", lbl: "SOM", sub: "500 businesses ×\nKES 1.5M/mo", valColor: C.accentDeep },
    ];
    for (const b of bars) {
      shape(s, "rect", b.bx, b.y, 1.7, b.h, { fill: b.fill });
      T(s, b.val, b.tx, b.y - 0.42, 2.1, 0.36, { size: 17, color: b.valColor, align: "ctr" });
      s.addText(
        [
          { text: b.lbl, options: { fontSize: 11, color: C.dark, breakLine: true, charSpacing: 40 } },
          { text: b.sub, options: { fontSize: 9, color: C.mutedLight } },
        ],
        { x: b.tx, y: 6.1, w: 2.1, h: 0.7, fontFace: F, bold: true, align: "ctr", valign: "top", isTextBox: true, margin: 0, lineSpacingMultiple: 1.2 },
      );
    }

    card(s, 7.85, 2.5, 4.78, 3.78, { r: 0.14 });
    T(s, "THE WEDGE MATH · BOTTOM-UP", 8.25, 2.85, 4.03, 0.28, { size: 10, color: C.mutedLight, spc: 60 });
    s.addText(
      [
        { text: "500 businesses", options: { fontSize: 17, color: C.dark, breakLine: true } },
        { text: "× KES 1.5M a month", options: { fontSize: 14, color: C.dark, breakLine: true } },
        { text: "× 1%", options: { fontSize: 14, color: C.dark, breakLine: true } },
        { text: "= KES 90M a year  (~$700K)", options: { fontSize: 14, color: C.accentDeep } },
      ],
      { x: 8.25, y: 3.25, w: 4.03, h: 1.55, fontFace: F, bold: true, valign: "top", isTextBox: true, margin: 0, lineSpacingMultiple: 1.35 },
    );
    T(s, "Exporters lift this sharply. One avocado exporter alone moves about USD 150,000 a month.",
      8.25, 5.0, 4.03, 0.55, { size: 12.5, color: C.mutedLight, lsm: 1.2, valign: "top" });
    T(s, "*Top-down figures approximate. Verify before circulating.",
      8.25, 5.83, 4.03, 0.3, { size: 9.5, color: C.mutedLight });

    s.addNotes(
      "(~25s): We size this bottom-up. Five hundred trading businesses, each moving one and a half million shillings a month across a border, at one percent, is ninety million shillings a year — about seven hundred thousand dollars. That is the wedge, and it is a fraction of Kenya's cross-border goods trade. Exporters lift it: a single avocado exporter moves a hundred fifty thousand dollars a month. The top-down numbers are approximate; the bottom-up one comes from interview ticket sizes.",
    );
  }

  // ============================================================ 6 · BUSINESS MODEL
  {
    const s = slide(false);
    chrome(s, 6, { eyebrow: "06 · BUSINESS MODEL", title: "Flat 1% of every payment. Nothing on the exchange rate." });

    const units = [
      { x: 0.7, ic: "LuUserPlus", lbl: "CAC", val: "$200", sub: "founder-led and referral" },
      { x: 4.813, ic: "LuClock", lbl: "PAYBACK", val: "~2 mo", sub: "on fees alone" },
      { x: 8.926, ic: "LuTrendingUp", lbl: "LTV", val: "$3,400", sub: "three years, 80% retention" },
    ];
    for (const u of units) {
      card(s, u.x, 2.42, 3.703, 1.98, { r: 0.12 });
      await iconDisc(s, u.ic, u.x + 0.28, 2.72, 0.6, { fill: C.light });
      T(s, u.lbl, u.x + 1.02, 2.76, 2.403, 0.26, { size: 10, color: C.mutedLight, spc: 70 });
      T(s, u.val, u.x + 1.02, 3.0, 2.403, 0.62, { size: 30, color: C.dark });
      T(s, u.sub, u.x + 0.28, 3.84, 3.143, 0.36, { size: 12, color: C.mutedLight });
    }
    T(s, "→", 4.408, 3.17, 0.4, 0.45, { size: 20, color: C.mutedLight, align: "ctr" });
    T(s, "→", 8.521, 3.17, 0.4, 0.45, { size: 20, color: C.mutedLight, align: "ctr" });

    card(s, 0.7, 4.85, 7.35, 1.62, { fill: C.dark, line: null, r: 0.14 });
    T(s, "17×", 1.05, 5.08, 2.5, 1.15, { size: 54, color: C.accent });
    s.addText(
      [
        { text: "LTV to CAC", options: { fontSize: 15, color: C.cream, breakLine: true } },
        { text: "payback inside two months", options: { fontSize: 13, color: C.mutedDark } },
      ],
      { x: 3.75, y: 5.3, w: 4.1, h: 0.8, fontFace: F, bold: true, valign: "middle", isTextBox: true, margin: 0, lineSpacingMultiple: 1.3 },
    );
    card(s, 8.4, 4.85, 4.23, 1.62, { r: 0.14 });
    s.addText(
      [
        { text: "85% gross margin", options: { fontSize: 16, color: C.dark, breakLine: true } },
        { text: "Partner fees pass through, not absorbed.", options: { fontSize: 12.5, color: C.mutedLight } },
      ],
      { x: 8.75, y: 5.22, w: 3.53, h: 0.9, fontFace: F, bold: true, valign: "middle", isTextBox: true, margin: 0, lineSpacingMultiple: 1.3 },
    );

    s.addNotes(
      "(~25s): One revenue line: a flat one percent of every payment, in or out. We take nothing on the exchange rate — the partner's rate passes straight through, and so does their fee, shown as its own line. A business moving one and a half million shillings a month pays us about fifteen thousand. Acquisition is founder-led and referral, so we model two hundred dollars a business and pay it back in two months. Unit figures are targets, not actuals.",
    );
  }

  // ============================================================ 7 · TRACTION
  {
    const s = slide(false);
    chrome(s, 7, {
      eyebrow: "07 · TRACTION",
      title: [
        { text: "Five interviews. ", options: { color: C.dark } },
        { text: "KES 26M a month", options: { color: C.accentDeep } },
        { text: " of validated volume.", options: { color: C.dark } },
      ],
    });
    T(s, "Cumulative monthly cross-border volume represented by interviewed businesses, KES millions.",
      0.7, 2.18, 7.3, 0.3, { size: 11, color: C.mutedLight });

    s.addChart(
      pres.charts.LINE,
      [{ name: "Volume represented", labels: ["Advisor", "Cars", "Electronics", "Hardware", "Produce"], values: [0.1, 0.6, 2.6, 6.6, 26.0] }],
      {
        x: 0.7, y: 2.55, w: 7.3, h: 4.15,
        chartColors: [C.accent],
        lineSize: 3, lineSmooth: false,
        lineDataSymbol: "circle", lineDataSymbolSize: 7,
        lineDataSymbolSolidFill: { color: C.accent },
        showValue: true, dataLabelPosition: "t",
        dataLabelColor: C.dark, dataLabelFontSize: 11, dataLabelFontFace: F, dataLabelFontBold: true,
        dataLabelFormatCode: "0.0",
        catAxisLabelColor: C.mutedLight, catAxisLabelFontSize: 10.5, catAxisLabelFontFace: F,
        valAxisLabelColor: C.mutedLight, valAxisLabelFontSize: 9.5, valAxisLabelFontFace: F,
        valAxisMaxVal: 30, valAxisMinVal: 0,
        valGridLine: { color: C.border, size: 0.75 },
        catGridLine: { style: "none" },
        catAxisLineShow: true, valAxisLineShow: false,
        showLegend: false, showTitle: false,
        plotArea: { fill: { color: C.light } },
        chartArea: { fill: { color: C.light } },
      },
    );

    card(s, 8.35, 2.55, 4.28, 4.15, { r: 0.14 });
    const stats = [
      ["3 of 3", "importers asked said they would switch"],
      ["KES 26M", "monthly volume across five businesses"],
      ["6+", "warm referrals already offered"],
    ];
    let sy = 2.92;
    for (const [k, v] of stats) {
      T(s, k, 8.72, sy, 3.54, 0.55, { size: 28, color: C.dark });
      T(s, v, 8.72, sy + 0.55, 3.54, 0.32, { size: 12, color: C.mutedLight });
      sy += 1.28;
    }

    s.addNotes(
      "(~30s): We are pre-revenue, so this is validation, not income. Five businesses interviewed in September: a hardware importer, a car importer, an electronics importer, an avocado exporter and an advisor who runs training across the region. Together they move about twenty-six million shillings a month across borders. Every importer I asked directly said they would switch for faster and cheaper, provided the money is safe. Six further introductions are already offered.",
    );
  }

  // ============================================================ 8 · COMPETITION
  {
    const s = slide(false);
    chrome(s, 8, { eyebrow: "08 · COMPETITION", title: "We win the trade that banks price out and cash can't reach." });

    const hdr = (t, own) => ({
      text: t,
      options: { fill: { color: own ? C.accent : C.dark }, color: own ? C.dark : C.cream, fontSize: 12.5, bold: true, align: "left", valign: "middle" },
    });
    const lab = (t) => ({ text: t, options: { fill: { color: C.light }, color: C.mutedLight, fontSize: 11, bold: true, valign: "middle" } });
    const cel = (t) => ({ text: t, options: { fill: { color: C.white }, color: C.dark, fontSize: 12.5, bold: true, valign: "middle" } });
    const own = (t) => ({ text: t, options: { fill: { color: C.tintAccent }, color: C.dark, fontSize: 12, bold: true, valign: "middle" } });

    s.addTable(
      [
        [{ text: "", options: { fill: { color: C.light } } }, hdr("Banks / SWIFT"), hdr("Forex agent + cash"), hdr("Meridian", true)],
        [lab("All-in cost"), cel("8 to 10%"), cel("3 to 5%, plus risk"), own("Partner fee + flat 1%")],
        [lab("Time to land"), cel("2 to 5 days"), cel("1 to 3 days"), own("Minutes")],
        [lab("Built for trade"), cel("Weeks of onboarding"), cel("No record at all"), own("Trade docs attached, KYB in a day")],
      ],
      {
        x: 0.7, y: 2.5, w: 11.93,
        colW: [2.5, 2.95, 2.95, 3.53],
        rowH: [0.56, 0.66, 0.66, 0.66],
        fontFace: F,
        border: { type: "solid", color: C.light, pt: 2 },
        margin: [0.06, 0.14, 0.06, 0.14],
      },
    );

    await iconDisc(s, ["LuLock", "LuShield"], 0.7, 5.7, 0.66);
    s.addText(
      [
        { text: "Moat forming: ", options: { color: C.dark } },
        { text: "every settled payment trains our compliance engine and our corridor routing. A copycat starts from zero.", options: { color: C.mutedLight } },
      ],
      { x: 1.62, y: 5.74, w: 11.01, h: 0.6, fontFace: F, fontSize: 14, bold: true, valign: "middle", isTextBox: true, margin: 0, lineSpacingMultiple: 1.2 },
    );

    s.addNotes(
      "(~25s): Our real competitor is not another fintech, it is the importer's own bank and a trusted forex agent. The bank is slow and expensive but safe. The agent is cheaper but means carrying cash across Nairobi and leaves no record a supplier or a regulator can read. We are the only one of the three that is fast, priced openly, and produces a clean record. The moat compounds with every payment we settle.",
    );
  }

  // ============================================================ 9 · GO-TO-MARKET
  {
    const s = slide(false);
    chrome(s, 9, { eyebrow: "09 · GO-TO-MARKET", title: "Four pilots first, then the referrals they already offered." });

    const gtm = [
      { ic: "LuHandshake", tag: "NOW", hot: true, head: "Named pilots", body: "The four businesses we interviewed, onboarded by hand and settled at small value first.", chip: "4 pilots", chipHot: true },
      { ic: "LuUsers", tag: "MOTION", hot: false, head: "Referral loop", body: "SMEs Chamber members and importer peers. A month of Meridian fees waived per introduction.", chip: "6+ offered", chipHot: false },
      { ic: "LuGlobe", tag: "NEXT", hot: false, head: "Exporters pull buyers", body: "Every payment link and embedded checkout puts Meridian in front of a buyer in Europe or the Gulf.", chip: "Inbound", chipHot: false },
    ];
    let gy = 2.62;
    for (const g of gtm) {
      await iconDisc(s, g.ic, 0.7, gy, 0.7);
      pill(s, g.tag, 1.68, gy + 0.03, 1.05, 0.32, {
        fill: g.hot ? C.dark : C.white, line: g.hot ? C.dark : C.border,
        color: g.hot ? C.cream : C.mutedLight, size: 8.5,
      });
      T(s, g.head, 2.9, gy - 0.02, 2.95, 0.36, { size: 15.5, color: C.dark });
      T(s, g.body, 2.9, gy + 0.46, 5.0, 0.62, { size: 12.5, color: C.mutedLight, lsm: 1.2, valign: "top" });
      pill(s, g.chip, 5.95, gy - 0.02, 1.95, 0.42, {
        fill: g.chipHot ? C.accent : C.white, line: g.chipHot ? C.accent : C.border, color: C.dark, size: 10,
      });
      gy += 1.34;
    }

    // designed panel (template photo slot): payment link mock
    card(s, 8.3, 2.62, 4.33, 3.8, { r: 0.14 });
    s.addText(
      [
        { text: "Meridian", options: { color: C.dark } },
        { text: ".", options: { color: C.accent } },
      ],
      { x: 8.62, y: 2.9, w: 1.6, h: 0.3, fontFace: F, fontSize: 12, bold: true, valign: "middle", isTextBox: true, margin: 0 },
    );
    pill(s, "PAYMENT LINK", 10.9, 2.9, 1.42, 0.3, { fill: C.tintAccent, line: C.tintAccent, color: C.accentDeep, size: 8 });
    T(s, "Kilimo Fresh Exports Ltd", 8.62, 3.36, 3.7, 0.26, { size: 9.5, color: C.mutedLight });
    T(s, "USD 36,000", 8.62, 3.6, 3.7, 0.5, { size: 24, color: C.dark });
    T(s, "Invoice INV-2048 · avocado shipment, week 38", 8.62, 4.1, 3.7, 0.24, { size: 9, color: C.mutedLight });
    const chips = [["Bank", 8.62], ["Card", 9.9], ["M-Pesa", 11.18]];
    for (const [t, cx] of chips) pill(s, t, cx, 4.34, 1.14, 0.34, { fill: C.light, line: C.border, color: C.dark, size: 9 });
    s.addText(
      [
        { text: "Partner fee", options: { fontSize: 9.5, color: C.mutedLight } },
        { text: "   $540", options: { fontSize: 9.5, color: C.dark, breakLine: true } },
        { text: "Meridian 1%", options: { fontSize: 9.5, color: C.mutedLight } },
        { text: "   $360", options: { fontSize: 9.5, color: C.dark } },
      ],
      { x: 8.62, y: 4.86, w: 3.7, h: 0.5, fontFace: F, bold: true, valign: "middle", isTextBox: true, margin: 0, lineSpacingMultiple: 1.3 },
    );
    pill(s, "Pay USD 36,000", 8.62, 5.46, 3.7, 0.46, { fill: C.accent, line: C.accent, color: C.dark, size: 11.5 });
    T(s, "Buyer in Hamburg pays by card or bank.", 8.62, 6.02, 3.7, 0.24, { size: 8.5, color: C.mutedLight });
    T(s, "The same page embeds on the seller's own site", 8.3, 6.52, 4.33, 0.28, { size: 9.5, color: C.mutedLight });

    s.addNotes(
      "(~25s): No paid acquisition in year one. We start with the four businesses who already told us their problem, onboard them by hand, and settle real money at small value. They have offered six introductions between them; we waive a month of fees for each one that converts. Then distribution compounds on its own: every payment link an exporter sends puts Meridian in front of a buyer in Europe or the Gulf.",
    );
  }

  // ============================================================ 10 · TEAM
  {
    const s = slide(false);
    chrome(s, 10, { eyebrow: "10 · TEAM", title: "Built by someone who ships, advised by someone who knows the buyers." });

    const team = [
      { x: 0.7, initials: "BW", name: "Brian Waweru", role: "FOUNDER · PRODUCT & ENGINEERING", body: "Founder of Appify. Shipped Eazibiz and DealerSync. Ran every interview here." },
      { x: 4.77, initials: "B", name: "Bright", role: "ADVISOR · MARKET", body: "Runs cybersecurity training across the region. Brought the inbound case." },
      { x: 8.84, icon: ["LuUserCheck", "LuUserPlus"], name: "Compliance lead", role: "HIRING WITH THIS ROUND", body: "Part-time, ex-bank AML. In place before the first live shilling." },
    ];
    for (const t of team) {
      card(s, t.x, 2.5, 3.78, 3.28, { r: 0.12 });
      shape(s, "ellipse", t.x + 0.34, 2.86, 0.92, 0.92, { fill: C.dark });
      if (t.initials) T(s, t.initials, t.x + 0.34, 2.84, 0.92, 0.92, { size: 20, color: C.cream, align: "ctr" });
      else s.addImage({ data: await icon(t.icon, C.accent), x: t.x + 0.58, y: 3.1, w: 0.44, h: 0.44 });
      T(s, t.name, t.x + 0.34, 4.0, 3.1, 0.34, { size: 16, color: C.dark });
      T(s, t.role, t.x + 0.34, 4.36, 3.1, 0.26, { size: 9.5, color: C.mutedLight, spc: 50 });
      T(s, t.body, t.x + 0.34, 4.68, 3.1, 0.82, { size: 12.5, color: C.mutedLight, lsm: 1.18, valign: "top" });
    }
    T(s, "“The spec is written, the demos are built, and the customers are named. What is missing is the build.”",
      0.7, 6.1, 11.93, 0.4, { size: 15, color: C.accentDeep });

    s.addNotes(
      "(~20s): Be straight about this: today it is me. I have shipped two B2B products for Kenyan businesses and I ran all five of these interviews myself. Bright advises on the market and brought us the inbound use case. The first hire this round funds is a part-time compliance lead, in place before we move a single live shilling. I am not pretending we are a team of ten.",
    );
  }

  // ============================================================ 11 · FINANCIALS
  {
    const s = slide(false);
    chrome(s, 11, {
      eyebrow: "11 · FINANCIALS",
      title: [
        { text: "Path to ", options: { color: C.dark } },
        { text: "$700K ARR", options: { color: C.accentDeep } },
        { text: " by 2029.", options: { color: C.dark } },
      ],
    });
    T(s, "Projected annual revenue, $ '000. Driven by one assumption.", 0.7, 2.18, 7.0, 0.3, { size: 11, color: C.mutedLight });

    s.addChart(
      pres.charts.BAR,
      [{ name: "ARR", labels: ["2027", "2028", "2029"], values: [42, 209, 700] }],
      {
        x: 0.7, y: 2.55, w: 6.9, h: 4.15,
        barDir: "col", barGapWidthPct: 90,
        chartColors: [C.mid, C.mid, C.accent],
        varyColors: true,
        showValue: true, dataLabelPosition: "outEnd",
        dataLabelColor: C.dark, dataLabelFontSize: 12, dataLabelFontFace: F, dataLabelFontBold: true,
        catAxisLabelColor: C.mutedLight, catAxisLabelFontSize: 11, catAxisLabelFontFace: F,
        valAxisLabelColor: C.mutedLight, valAxisLabelFontSize: 9.5, valAxisLabelFontFace: F,
        valAxisMaxVal: 800,
        valGridLine: { color: C.border, size: 0.75 },
        catGridLine: { style: "none" },
        showLegend: false, showTitle: false,
        plotArea: { fill: { color: C.light } },
        chartArea: { fill: { color: C.light } },
      },
    );

    card(s, 8.0, 2.55, 4.63, 2.45, { r: 0.14 });
    T(s, "THE ONE ASSUMPTION", 8.35, 2.9, 3.93, 0.28, { size: 10, color: C.mutedLight, spc: 60 });
    T(s, "500 active businesses by 2029, each moving KES 1.5M a month.",
      8.35, 3.28, 3.93, 0.95, { size: 15, color: C.dark, lsm: 1.25, valign: "top" });
    T(s, "Everything else is arithmetic. Challenge this number.", 8.35, 4.3, 3.93, 0.45, { size: 11.5, color: C.mutedLight, lsm: 1.2, valign: "top" });

    card(s, 8.0, 5.25, 4.63, 1.45, { fill: C.dark, line: null, r: 0.14 });
    s.addText(
      [
        { text: "Burn $8K / month after hires", options: { fontSize: 15, color: C.cream, breakLine: true } },
        { text: "12 months runway on this raise", options: { fontSize: 13, color: C.mutedDark } },
      ],
      { x: 8.35, y: 5.53, w: 3.93, h: 0.9, fontFace: F, bold: true, valign: "middle", isTextBox: true, margin: 0, lineSpacingMultiple: 1.3 },
    );

    s.addNotes(
      "(~20s): Forty-two thousand dollars next year from thirty businesses, two hundred nine the year after, seven hundred by twenty twenty-nine. That rests on a single assumption you should push on: five hundred active businesses each moving one and a half million shillings a month. Everything else is arithmetic off the one percent. Burn is eight thousand a month once the two hires are in, which is twelve months of runway on this raise.",
    );
  }

  // ============================================================ 12 · THE ASK
  {
    const s = slide(true);
    chrome(s, 12, {
      dark: true,
      eyebrow: "12 · THE ASK",
      title: [
        { text: "Raising ", options: { color: C.cream } },
        { text: "$150K", options: { color: C.accent } },
        { text: " to reach 100 paying businesses.", options: { color: C.cream } },
      ],
    });

    T(s, "USE OF FUNDS", 0.7, 2.38, 5.0, 0.28, { size: 10, color: C.mutedDark, spc: 60 });
    const funds = [
      { x: 0.7, w: 5.26, fill: C.accent, lbl: "Build & team · 45%", sub: "eight-week MVP, two hires", subColor: C.dark },
      { x: 6.08, w: 3.51, fill: C.mid, lbl: "Compliance & legal · 30%", sub: "AML policy, KYB, partner terms", subColor: C.dark },
      { x: 9.71, w: 2.92, fill: C.darkCardLine, lbl: "Float & ops · 25%", sub: "partner liquidity", subColor: C.cream },
    ];
    for (const f of funds) {
      shape(s, "rect", f.x, 3.1, f.w, 0.6, { fill: f.fill });
      T(s, f.lbl, f.x, 2.76, f.w, 0.3, { size: 12, color: C.cream });
      T(s, f.sub, f.x + 0.14, 3.18, f.w - 0.28, 0.44, { size: 11, color: f.subColor });
    }

    T(s, "BY MONTH 18", 0.7, 4.42, 5.0, 0.28, { size: 10, color: C.mutedDark, spc: 60 });
    const miles = [
      { x: 0.7, ic: ["LuBuilding2", "LuBuilding"], t: "100 active businesses" },
      { x: 4.77, ic: "LuBanknote", t: "$12K monthly revenue" },
      { x: 8.84, ic: ["LuRoute", "LuGlobe"], t: "4 live corridors" },
    ];
    for (const m of miles) {
      card(s, m.x, 4.8, 3.78, 0.86, { fill: C.darkCard, line: C.darkCardLine, r: 0.12 });
      s.addImage({ data: await icon(m.ic, C.accent), x: m.x + 0.28, y: 5.02, w: 0.42, h: 0.42 });
      T(s, m.t, m.x + 0.88, 4.8, 2.62, 0.86, { size: 14.5, color: C.cream });
    }
    T(s, "These milestones price the next round.", 0.7, 5.92, 8.0, 0.32, { size: 12.5, color: C.mutedDark });
    s.addText(
      [
        { text: "brian@appify.co.ke", options: { fontSize: 14, color: C.cream } },
        { text: "    ·    Appify Softwares Limited, Nairobi", options: { fontSize: 12.5, color: C.mutedDark } },
      ],
      { x: 0.7, y: 6.42, w: 11.93, h: 0.36, fontFace: F, bold: true, valign: "middle", isTextBox: true, margin: 0 },
    );

    s.addNotes(
      "(~25s): We are raising a hundred fifty thousand dollars. Forty-five percent builds the product and puts two people on it, thirty percent buys the compliance work properly — policy, legal review, partner agreements — and twenty-five percent is partner float and operations. By month eighteen: a hundred paying businesses, twelve thousand dollars a month, four live corridors. Those are the milestones that price the next round. CONFIRM THE RAISE FIGURE BEFORE SENDING THIS DECK.",
    );
  }

  await pres.writeFile({ fileName: OUT });
  console.log("wrote", OUT);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
