const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const Lu = require("react-icons/lu");

// Palette from the Meridian design system (styles.css), converted to hex.
const C = {
  bg: "0F2624", // deep teal background
  surface: "173432", // panel
  surface2: "1E403D",
  fg: "F2F7F4", // near white
  muted: "9FB8B2", // muted text
  primary: "3ECFA0", // mint
  accent: "E5C158", // gold
  danger: "E58A7A",
  ink: "0B1A19",
};
const FONT = "Calibri";
const OUT = process.argv[2] || "meridian-pitch-deck.pptx";

async function icon(name, color, size = 256) {
  const Cmp = Lu[name];
  if (!Cmp) throw new Error("no icon " + name);
  const svg = ReactDOMServer.renderToStaticMarkup(
    React.createElement(Cmp, { color: "#" + color, size, strokeWidth: 1.75 }),
  );
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + png.toString("base64");
}

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10 x 5.625 in
pres.author = "Appify Softwares Limited";
pres.title = "Meridian — Investor Pitch";

const W = 10;
const H = 5.625;
const M = 0.5;

function base(opts = {}) {
  const s = pres.addSlide();
  s.background = { color: opts.dark === false ? C.fg : C.bg };
  return s;
}

function title(s, text, opts = {}) {
  s.addText(text, {
    x: M,
    y: 0.38,
    w: W - 2 * M,
    h: 0.7,
    fontFace: FONT,
    fontSize: opts.size || 28,
    bold: true,
    color: opts.color || C.fg,
    isTextBox: true,
    margin: 0,
    valign: "top",
  });
}

function sub(s, text, y = 1.05) {
  s.addText(text, {
    x: M,
    y,
    w: W - 2 * M,
    h: 0.5,
    fontFace: FONT,
    fontSize: 14,
    color: C.muted,
    isTextBox: true,
    margin: 0,
    valign: "top",
  });
}

function footer(s, n) {
  s.addText("Meridian  ·  Appify Softwares Limited  ·  Confidential", {
    x: M,
    y: H - 0.38,
    w: 6,
    h: 0.25,
    fontFace: FONT,
    fontSize: 8,
    color: C.muted,
    isTextBox: true,
    margin: 0,
  });
  s.addText(String(n), {
    x: W - M - 0.6,
    y: H - 0.38,
    w: 0.6,
    h: 0.25,
    fontFace: FONT,
    fontSize: 8,
    color: C.muted,
    align: "right",
    isTextBox: true,
    margin: 0,
  });
}

async function iconCircle(s, name, x, y, d = 0.5, fill = C.primary, iconColor = C.ink) {
  s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill } });
  const pad = d * 0.24;
  s.addImage({ data: await icon(name, iconColor), x: x + pad, y: y + pad, w: d - 2 * pad, h: d - 2 * pad });
}

function card(s, x, y, w, h, fill = C.surface) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x,
    y,
    w,
    h,
    fill: { color: fill },
    line: { color: fill },
    rectRadius: 0.08,
  });
}

function text(s, str, x, y, w, h, o = {}) {
  s.addText(str, {
    x,
    y,
    w,
    h,
    fontFace: FONT,
    fontSize: o.size || 13,
    color: o.color || C.fg,
    bold: !!o.bold,
    italic: !!o.italic,
    align: o.align || "left",
    valign: o.valign || "top",
    isTextBox: true,
    margin: 0,
    paraSpaceAfter: o.para || 0,
    lineSpacingMultiple: o.lsm || 1.05,
  });
}

function bullets(s, items, x, y, w, h, o = {}) {
  s.addText(
    items.map((t, i) => ({
      text: t,
      options: { bullet: { indent: 12 }, breakLine: i < items.length - 1, paraSpaceAfter: o.para || 6 },
    })),
    {
      x,
      y,
      w,
      h,
      fontFace: FONT,
      fontSize: o.size || 13,
      color: o.color || C.fg,
      valign: "top",
      isTextBox: true,
      margin: 0,
    },
  );
}

(async () => {
  let n = 0;

  // ---------------------------------------------------------------- 1 Title
  {
    const s = base();
    n++;
    // wordmark
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: M,
      y: 0.6,
      w: 0.55,
      h: 0.55,
      fill: { color: C.primary },
      line: { color: C.primary },
      rectRadius: 0.12,
    });
    s.addShape(pres.shapes.OVAL, {
      x: M + 0.155,
      y: 0.755,
      w: 0.24,
      h: 0.24,
      fill: { color: C.primary },
      line: { color: C.ink, width: 2 },
    });
    text(s, "Meridian", M + 0.7, 0.62, 3, 0.5, { size: 22, bold: true });
    text(s, "Pay suppliers and get paid\nacross borders. In minutes.", M, 1.75, 6.15, 1.25, {
      size: 30,
      bold: true,
      lsm: 1.0,
    });
    text(
      s,
      "B2B payments for African importers and exporters. Flat 1% on top of the partner fee. No FX markup. Money lands the same day.",
      M,
      3.45,
      5.6,
      0.9,
      { size: 14, color: C.muted },
    );
    text(s, "Pre-seed  ·  Appify Softwares Limited, Nairobi  ·  September 2026", M, 4.75, 7, 0.3, {
      size: 11,
      color: C.muted,
    });

    // right-side mock card: sample transfer
    card(s, 6.7, 1.5, 2.8, 3.0, C.surface);
    text(s, "SAMPLE TRANSFER", 6.8, 1.7, 2.5, 0.25, { size: 8, color: C.muted, bold: true });
    text(s, "Nairobi — you send", 6.8, 2.0, 2.5, 0.25, { size: 9, color: C.muted });
    text(s, "KSh 1,500,000", 6.8, 2.22, 2.5, 0.4, { size: 20, bold: true });
    s.addShape(pres.shapes.LINE, { x: 6.9, y: 2.75, w: 0, h: 0.75, line: { color: C.primary, width: 1.5 } });
    text(s, "Compliance cleared\nConverted by partner\nPayout sent", 7.05, 2.72, 2.3, 0.8, {
      size: 9,
      color: C.muted,
      lsm: 1.2,
    });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 6.8,
      y: 3.6,
      w: 2.45,
      h: 0.72,
      fill: { color: C.surface2 },
      line: { color: C.primary, width: 0.75 },
      rectRadius: 0.06,
    });
    text(s, "Shenzhen — supplier receives", 6.92, 3.66, 2.3, 0.22, { size: 8, color: C.muted });
    text(s, "¥ 82,400", 6.92, 3.86, 2.3, 0.4, { size: 18, bold: true, color: C.primary });
    text(s, "Total cost 2%. A bank takes 8 to 10%.", 6.8, 4.36, 2.6, 0.22, { size: 8, color: C.muted });
    s.addNotes(
      "Open: Meridian lets African businesses pay suppliers anywhere and collect from buyers anywhere, in minutes, for a flat 1% on top of a licensed partner's fee. We do not touch the exchange rate. Built by Appify in Nairobi.",
    );
  }

  // ---------------------------------------------------------------- 2 Problem
  {
    const s = base();
    n++;
    title(s, "A week for money to land. The factory waits.");
    sub(s, "What Kenyan importers and exporters told us in discovery interviews, September 2026.");

    const stats = [
      { k: "4 to 5 days", v: "for a supplier payment to confirm through Equity or Co-operative Bank", icon: "LuClock" },
      { k: "8 to 10%", v: "lost to fees and a poor exchange rate on a shilling account", icon: "LuTrendingDown" },
      { k: "1 flight", v: "a South Sudan buyer took to Nairobi to pay a Kenyan supplier in person", icon: "LuPlane" },
    ];
    const cw = 2.85;
    const gap = 0.225;
    for (let i = 0; i < 3; i++) {
      const x = M + i * (cw + gap);
      card(s, x, 1.65, cw, 2.15);
      await iconCircle(s, stats[i].icon, x + 0.25, 1.9, 0.5);
      text(s, stats[i].k, x + 0.25, 2.5, cw - 0.5, 0.55, { size: 26, bold: true, color: C.primary });
      text(s, stats[i].v, x + 0.25, 3.05, cw - 0.5, 0.7, { size: 11, color: C.muted });
    }
    card(s, M, 4.0, W - 2 * M, 0.95, C.surface2);
    text(
      s,
      "“Manufacturing does not start until payment lands. With a 14-day lead time, a five-day bank delay means stockouts.”",
      M + 0.3,
      4.12,
      W - 2 * M - 0.6,
      0.5,
      { size: 13, italic: true },
    );
    text(s, "Hardware importer, Nairobi. About 80% of imports from China.", M + 0.3, 4.6, 8, 0.25, {
      size: 10,
      color: C.muted,
    });
    footer(s, n);
    s.addNotes(
      "The core pain is time, not just fees. Late payment cascades: production does not start, stock runs out, cold storage bills grow, farmers must still be paid at harvest. Quotes are from our interviews; see docs/customer-interviews.md.",
    );
  }

  // ---------------------------------------------------------------- 3 What we heard
  {
    const s = base();
    n++;
    title(s, "Five interviews. One pattern.");
    sub(s, "Kenyan business owners moving money to China, Japan, the US, Europe and across Africa.");
    const rows = [
      ["Hardware importer", "China 80%, UK, Dubai", "KES 300k to 2M+ per order", "4 to 5 days. 8 to 10% fees. Carries cash to a forex agent.", "Would switch “without thinking”"],
      ["Car importer", "Japan", "KES 0.9M to 1.2M, 5 per year", "12 to 24 hours. Cost unknown.", "Yes. Will refer a bigger importer"],
      ["Avocado exporter", "Europe, Middle East, Egypt", "USD 35k to 40k per shipment", "2 to 3 days in. AML paperwork delays. FX timing.", "Time is the main cost"],
      ["Electronics importer", "US 99%", "Weekly containers", "Solved with a StanChart USD account. Pain is on his customers' side.", "Yes, if better exists"],
      ["Cyber training (advisor)", "South Sudan, Nigeria, Sierra Leone", "Course fees", "Foreign buyers cannot pay Kenyan businesses.", "Sees inbound demand"],
    ];
    const header = ["Business", "Corridors", "Ticket size", "Pain today", "Switch?"];
    const colW = [1.55, 1.75, 1.7, 2.6, 1.4];
    const tableRows = [
      header.map((h) => ({
        text: h,
        options: { bold: true, color: C.primary, fontSize: 10, fill: { color: C.surface2 } },
      })),
      ...rows.map((r) =>
        r.map((c, i) => ({
          text: c,
          options: { fontSize: 9.5, color: i === 0 ? C.fg : C.muted, bold: i === 0 },
        })),
      ),
    ];
    s.addTable(tableRows, {
      x: M,
      y: 1.6,
      w: W - 2 * M,
      colW,
      fontFace: FONT,
      border: { type: "solid", color: C.bg, pt: 1.5 },
      fill: { color: C.surface },
      valign: "middle",
      margin: [0.06, 0.08, 0.06, 0.08],
      rowH: [0.32, 0.5, 0.42, 0.5, 0.5, 0.42],
    });
    footer(s, n);
    s.addNotes(
      "Two findings changed the product. First, most interviewees pay suppliers outside Africa, so corridors are Africa to Africa and Africa to the world from day one. Second, pain depends on the bank. Mid-tier bank customers are the first target.",
    );
  }

  // ---------------------------------------------------------------- 4 Solution
  {
    const s = base();
    n++;
    title(s, "One account. Pay out. Get paid.");
    sub(s, "Meridian sits between the business's bank or mobile money and the rest of the world.");
    const cols = [
      {
        icon: "LuSend",
        h: "Pay a supplier abroad",
        b: "Pick the supplier. Enter the amount. See the partner fee, our 1% and exactly what they receive. Pay from M-Pesa or bank. Lands in minutes.",
      },
      {
        icon: "LuLink",
        h: "Get paid with a link",
        b: "Create a payment link. The buyer in Germany or Juba pays by card, bank or mobile money. The business receives local currency.",
      },
      {
        icon: "LuCode",
        h: "Checkout on your site",
        b: "One script tag. A Pay with Meridian button opens the same hosted page. No plugin, no SDK.",
      },
    ];
    const cw = 2.85;
    const gap = 0.225;
    for (let i = 0; i < 3; i++) {
      const x = M + i * (cw + gap);
      card(s, x, 1.65, cw, 2.55);
      await iconCircle(s, cols[i].icon, x + 0.25, 1.9, 0.5, i === 1 ? C.accent : C.primary);
      text(s, cols[i].h, x + 0.25, 2.55, cw - 0.5, 0.4, { size: 15, bold: true });
      text(s, cols[i].b, x + 0.25, 2.98, cw - 0.5, 1.15, { size: 11, color: C.muted, lsm: 1.15 });
    }
    text(
      s,
      "Meridian never holds funds. Licensed, regulated partners collect, convert and pay out. We build the software and check every transaction.",
      M,
      4.4,
      W - 2 * M,
      0.5,
      { size: 12, color: C.muted, italic: true },
    );
    footer(s, n);
    s.addNotes("Three surfaces, one primitive underneath: a payment request with a hosted page. Send is the inverse flow.");
  }

  // ---------------------------------------------------------------- 5 How it works
  {
    const s = base();
    n++;
    title(s, "How it works");
    sub(s, "Software and compliance are ours. Money movement belongs to licensed partners.");

    // layer diagram
    const layers = [
      { y: 1.7, label: "BUSINESS", fill: C.surface2, items: ["Kenyan importer or exporter", "M-Pesa or bank account"] },
      {
        y: 2.55,
        label: "MERIDIAN",
        fill: C.primary,
        dark: true,
        items: ["Onboarding and tiered KYB", "AML rules on every transaction", "Quotes, links, checkout, receipts"],
      },
      {
        y: 3.4,
        label: "LICENSED PARTNERS",
        fill: C.surface2,
        items: ["Kotani Pay: Africa collections and payouts, EUR", "Klasha: China (Alipay, UnionPay, bank), global wires"],
      },
      { y: 4.25, label: "RECIPIENT", fill: C.surface, items: ["Supplier in Shenzhen, Accra, Dubai or Hamburg", "Local currency in their own account"] },
    ];
    for (const L of layers) {
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: M,
        y: L.y,
        w: 5.6,
        h: 0.7,
        fill: { color: L.fill },
        line: { color: L.fill },
        rectRadius: 0.06,
      });
      text(s, L.label, M + 0.2, L.y + 0.1, 1.6, 0.5, {
        size: 10,
        bold: true,
        color: L.dark ? C.ink : C.primary,
        valign: "middle",
      });
      text(s, L.items.join("   ·   "), M + 1.8, L.y + 0.1, 3.7, 0.5, {
        size: 9.5,
        color: L.dark ? C.ink : C.fg,
        valign: "middle",
      });
    }
    // arrows between layers
    for (const y of [2.4, 3.25, 4.1]) {
      s.addShape(pres.shapes.DOWN_ARROW, {
        x: M + 2.7,
        y: y - 0.02,
        w: 0.2,
        h: 0.19,
        fill: { color: C.muted },
        line: { color: C.muted },
      });
    }

    // right: three steps
    const steps = [
      ["1", "Register", "Registration certificate and a director's ID. Small payments the same day."],
      ["2", "Pay or request", "See partner fee, Meridian 1%, and the amount received before confirming."],
      ["3", "Settled", "Partner collects, converts and pays out. Both sides get a receipt."],
    ];
    let y = 1.7;
    for (const [num, h, b] of steps) {
      s.addShape(pres.shapes.OVAL, {
        x: 6.5,
        y,
        w: 0.42,
        h: 0.42,
        fill: { color: C.accent },
        line: { color: C.accent },
      });
      text(s, num, 6.5, y, 0.42, 0.42, { size: 14, bold: true, color: C.ink, align: "center", valign: "middle" });
      text(s, h, 7.05, y - 0.02, 2.45, 0.3, { size: 14, bold: true });
      text(s, b, 7.05, y + 0.3, 2.45, 0.65, { size: 10.5, color: C.muted, lsm: 1.15 });
      y += 1.08;
    }
    footer(s, n);
    s.addNotes(
      "No wallet and no stored balance in the MVP. Every transaction is funded and settled end to end. This keeps us outside e-money rules and removes a ledger to reconcile.",
    );
  }

  // ---------------------------------------------------------------- 6 Pricing / business model
  {
    const s = base();
    n++;
    title(s, "Partner fee, plus 1%. Nothing else.");
    sub(s, "Every line shown before the customer confirms. No markup on the exchange rate.");

    s.addChart(
      pres.charts.BAR,
      [
        {
          name: "All-in cost of a KES to CNY supplier payment",
          labels: ["Bank route today", "Forex agent + bank", "Meridian"],
          values: [9.0, 4.5, 2.5],
        },
      ],
      {
        x: M,
        y: 1.6,
        w: 5.3,
        h: 3.1,
        barDir: "bar",
        chartColors: [C.muted, C.accent, C.primary],
        showValue: true,
        dataLabelPosition: "outEnd",
        dataLabelFormatCode: '0.0"%"',
        dataLabelColor: C.fg,
        dataLabelFontSize: 11,
        dataLabelFontFace: FONT,
        catAxisLabelColor: C.fg,
        catAxisLabelFontSize: 11,
        catAxisLabelFontFace: FONT,
        valAxisLabelColor: C.muted,
        valAxisLabelFontSize: 9,
        valAxisLabelFontFace: FONT,
        valAxisMaxVal: 12,
        valAxisLabelFormatCode: '0"%"',
        valGridLine: { color: C.surface2, size: 0.5 },
        catGridLine: { style: "none" },
        showLegend: false,
        showTitle: true,
        title: "Indicative all-in cost, % of amount sent",
        titleColor: C.muted,
        titleFontSize: 10,
        titleFontFace: FONT,
        plotArea: { fill: { color: C.bg } },
        chartArea: { fill: { color: C.bg } },
      },
    );
    text(s, "Bank figure from importer interviews. Meridian figure is 1% plus an indicative 1.5% partner fee. Real partner fees vary by country and method.", M, 4.72, 5.3, 0.4, {
      size: 8.5,
      color: C.muted,
    });

    // right column: revenue model
    card(s, 6.2, 1.6, 3.3, 3.5);
    text(s, "Revenue model", 6.45, 1.8, 2.9, 0.35, { size: 15, bold: true });
    const rm = [
      ["1%", "of every payment, in and out"],
      ["0", "FX margin. Partner rate passed through."],
      ["0", "monthly fee. No minimums."],
    ];
    let y = 2.3;
    for (const [k, v] of rm) {
      text(s, k, 6.45, y, 0.7, 0.45, { size: 22, bold: true, color: C.primary });
      text(s, v, 7.2, y + 0.06, 2.15, 0.45, { size: 11, color: C.muted, lsm: 1.1 });
      y += 0.62;
    }
    text(
      s,
      "Worked example: a hardware importer moving KES 2M a month pays Meridian KES 20,000 a month. Today that same business loses KES 160,000 to 200,000 on the bank route.",
      6.45,
      4.15,
      2.9,
      0.88,
      { size: 10, color: C.fg, lsm: 1.15 },
    );
    footer(s, n);
    s.addNotes(
      "We charge only for what we control. The partner's fee is theirs and is shown separately. If partner fees fall, our customers see it immediately. Unit economics: 1% gross take rate with near-zero variable cost per transaction beyond partner API calls and email.",
    );
  }

  // ---------------------------------------------------------------- 7 Market
  {
    const s = base();
    n++;
    title(s, "Kenya's importers first, then their corridors");
    sub(s, "Top-down figures are approximate public trade statistics. Bottom-up is from our interviews.");

    const big = [
      { k: "~USD 19B", v: "Kenya goods imports per year. China is the largest source.", src: "KNBS, approx. 2023" },
      { k: "~USD 7B", v: "Kenya goods exports per year. Europe and Middle East lead fresh produce.", src: "KNBS, approx. 2023" },
      { k: "6 markets", v: "at launch: Kenya, Nigeria, Ghana, South Africa, Uganda, Tanzania.", src: "Partner coverage" },
    ];
    const cw = 2.85;
    const gap = 0.225;
    for (let i = 0; i < 3; i++) {
      const x = M + i * (cw + gap);
      card(s, x, 1.65, cw, 1.65);
      text(s, big[i].k, x + 0.25, 1.8, cw - 0.5, 0.5, { size: 24, bold: true, color: i === 2 ? C.accent : C.primary });
      text(s, big[i].v, x + 0.25, 2.32, cw - 0.5, 0.65, { size: 10.5, color: C.fg, lsm: 1.1 });
      text(s, big[i].src, x + 0.25, 3.02, cw - 0.5, 0.22, { size: 8, color: C.muted, italic: true });
    }

    card(s, M, 3.5, W - 2 * M, 1.45, C.surface2);
    text(s, "Bottom-up, from interview ticket sizes", M + 0.3, 3.62, 5, 0.3, { size: 12, bold: true, color: C.primary });
    bullets(
      s,
      [
        "A mid-size importer moves KES 1M to 2M a month across borders. At 1%, that is KES 10k to 20k a month per business.",
        "500 active businesses at that size is roughly KES 90M (USD 700k) a year in revenue.",
        "Exporters are larger: USD 35k to 40k per weekly shipment. Ten such exporters add USD 200k a year.",
      ],
      M + 0.3,
      3.95,
      W - 2 * M - 0.6,
      0.95,
      { size: 10.5, color: C.fg, para: 3 },
    );
    footer(s, n);
    s.addNotes(
      "Verify the top-down import and export figures against the latest KNBS Economic Survey before sharing externally. The bottom-up numbers are the ones we stand behind: they come directly from interview ticket sizes.",
    );
  }

  // ---------------------------------------------------------------- 8 Competition
  {
    const s = base();
    n++;
    title(s, "Why not a bank, a forex agent, or a fintech?");
    sub(s, "Most alternatives optimise for consumers, or for one corridor, or hide the real cost.");
    const header = ["", "Banks / SWIFT", "Forex agent + bank", "Consumer fintechs", "Meridian"];
    const rows = [
      ["Time to land", "2 to 5 days", "1 to 3 days", "Minutes to hours", "Minutes"],
      ["All-in cost", "8 to 10%", "3 to 5% plus risk", "3 to 6%, FX in the rate", "Partner fee + 1%"],
      ["Cost shown up front", "No", "No", "Rarely the FX part", "Every line, before confirm"],
      ["Built for B2B trade docs", "Yes, slowly", "No", "No", "Yes. Invoices, customs attached"],
      ["Africa to China, Japan, Gulf", "Yes", "Cash only", "Limited", "Yes, via Klasha"],
      ["Start same day", "No. Weeks of KYB", "Yes, informal", "Yes, for individuals", "Yes. Tiered KYB"],
    ];
    const colW = [2.0, 1.65, 1.65, 1.75, 1.95];
    const tableRows = [
      header.map((h, i) => ({
        text: h,
        options: {
          bold: true,
          fontSize: 10.5,
          color: i === 4 ? C.ink : C.primary,
          fill: { color: i === 4 ? C.primary : C.surface2 },
        },
      })),
      ...rows.map((r) =>
        r.map((c, i) => ({
          text: c,
          options: {
            fontSize: 10,
            bold: i === 0 || i === 4,
            color: i === 0 ? C.fg : i === 4 ? C.primary : C.muted,
            fill: { color: i === 4 ? C.surface2 : C.surface },
          },
        })),
      ),
    ];
    s.addTable(tableRows, {
      x: M,
      y: 1.6,
      w: W - 2 * M,
      colW,
      fontFace: FONT,
      border: { type: "solid", color: C.bg, pt: 1.5 },
      valign: "middle",
      margin: [0.06, 0.1, 0.06, 0.1],
      rowH: 0.44,
    });
    footer(s, n);
    s.addNotes(
      "Our edge is not a rail. Rails are commodity and we rent them. Our edge is the B2B workflow: tiered KYB so a business starts today, trade documents on the transfer, transparent pricing, and an embeddable way for foreign buyers to pay African sellers.",
    );
  }

  // ---------------------------------------------------------------- 9 Compliance
  {
    const s = base();
    n++;
    title(s, "Compliance is the product, not a checkbox");
    sub(s, "Banks lose days on document checks. We make it fast, tiered and automated, with a human on the exceptions.");

    // tiers
    card(s, M, 1.65, 4.6, 3.3);
    text(s, "Tiered KYB", M + 0.25, 1.8, 3, 0.35, { size: 15, bold: true });
    const tiers = [
      ["Tier 1  Starter", "Reg. certificate + director ID", "USD 500 / payment"],
      ["Tier 2  Verified", "All documents, manual review", "USD 10,000 / payment"],
      ["Tier 3  Enhanced", "Source of funds + bank statement", "Set per business"],
    ];
    let y = 2.25;
    for (const [a, b, c] of tiers) {
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: M + 0.25,
        y,
        w: 4.1,
        h: 0.78,
        fill: { color: C.surface2 },
        line: { color: C.surface2 },
        rectRadius: 0.05,
      });
      text(s, a, M + 0.4, y + 0.1, 2.5, 0.28, { size: 11.5, bold: true, color: C.primary });
      text(s, b, M + 0.4, y + 0.4, 2.45, 0.3, { size: 9.5, color: C.muted });
      text(s, c, M + 2.9, y + 0.1, 1.35, 0.58, { size: 10, bold: true, align: "right", valign: "middle" });
      y += 0.88;
    }

    // AML
    card(s, 5.35, 1.65, 4.15, 3.3);
    text(s, "Automated AML", 5.6, 1.8, 3, 0.35, { size: 15, bold: true });
    const aml = [
      ["LuShieldCheck", "Sanctions screening", "OFAC, UN, EU, UK lists refreshed nightly. Business, directors, owners, recipients, payers."],
      ["LuGauge", "Limits and velocity", "Per-payment and 30-day caps by tier. Structuring and pass-through detection."],
      ["LuUserCheck", "Human review", "Flags and held transactions go to a queue. Every decision logged for 7 years."],
    ];
    y = 2.3;
    for (const [ic, h, b] of aml) {
      await iconCircle(s, ic, 5.6, y, 0.4, C.accent);
      text(s, h, 6.1, y - 0.03, 3.2, 0.28, { size: 11.5, bold: true });
      text(s, b, 6.1, y + 0.25, 3.25, 0.55, { size: 9.5, color: C.muted, lsm: 1.1 });
      y += 0.88;
    }
    footer(s, n);
    s.addNotes(
      "Meridian is a technology platform. We do not hold client funds; licensed partners do. We still run a written AML policy, a named compliance officer, and 7-year retention. Tier limits sit inside what our partners allow us. Legal review before live money.",
    );
  }

  // ---------------------------------------------------------------- 10 Traction
  {
    const s = base();
    n++;
    title(s, "Where we are");
    sub(s, "Validated the problem. Built the demos. Designed the MVP. Ready to build.");
    const items = [
      { k: "5", v: "discovery interviews with importers, exporters and an advisor", icon: "LuUsers" },
      { k: "4 of 4", v: "importers asked said they would switch to a faster, cheaper, secure option", icon: "LuThumbsUp" },
      { k: "6+", v: "warm referrals offered: SMEs Chamber members, importer peers, a larger car importer", icon: "LuNetwork" },
      { k: "3", v: "live product demos: checkout, supplier payment, payment link. Waitlist open.", icon: "LuMonitorPlay" },
    ];
    const cw = 2.1;
    const gap = 0.2;
    for (let i = 0; i < 4; i++) {
      const x = M + i * (cw + gap);
      card(s, x, 1.65, cw, 2.2);
      await iconCircle(s, items[i].icon, x + 0.22, 1.85, 0.44, i % 2 ? C.accent : C.primary);
      text(s, items[i].k, x + 0.22, 2.4, cw - 0.44, 0.5, { size: 24, bold: true, color: C.primary });
      text(s, items[i].v, x + 0.22, 2.9, cw - 0.44, 0.9, { size: 10, color: C.muted, lsm: 1.12 });
    }
    card(s, M, 4.05, W - 2 * M, 0.9, C.surface2);
    text(s, "Next 30 days", M + 0.3, 4.15, 2, 0.3, { size: 11, bold: true, color: C.primary });
    text(
      s,
      "Sandbox accounts with Kotani Pay and Klasha. Savings simulation on one importer's real transaction data. PRD, TRD and eight-week build plan complete.",
      M + 0.3,
      4.42,
      W - 2 * M - 0.6,
      0.5,
      { size: 10.5, color: C.fg },
    );
    footer(s, n);
    s.addNotes(
      "We are pre-revenue and pre-build on the real product. What we have is a validated problem, named early customers, a demo site, and a complete spec. The ask funds the build and the first pilots.",
    );
  }

  // ---------------------------------------------------------------- 11 Roadmap
  {
    const s = base();
    n++;
    title(s, "Eight weeks to a live pilot");
    sub(s, "One developer, one app, one database, two partners. Compliance ships before money moves.");
    const phases = [
      ["0", "Foundation", "Wk 1", "SolidStart app, auth, email, hosting. Site ported."],
      ["1", "Onboarding", "Wk 2", "Business profile, document upload, auto-checks, admin approval."],
      ["2", "Compliance", "Wk 3", "Sanctions lists, screening, AML rules, limits, flag queue."],
      ["3", "Collect", "Wk 4 to 5", "Payment links, hosted page, embed script, Kotani webhooks, auto payout."],
      ["4", "Send", "Wk 6 to 7", "Recipients, quotes, pay-in, Kotani and Klasha payouts, trade docs."],
      ["5", "Pilot", "Wk 8", "Production keys, legal sign-off, monitoring, first live payments."],
    ];
    const cw = 1.42;
    const gap = 0.096;
    const y0 = 1.75;
    // timeline line
    s.addShape(pres.shapes.LINE, {
      x: M + cw / 2,
      y: y0 + 0.22,
      w: (cw + gap) * 5,
      h: 0,
      line: { color: C.surface2, width: 3 },
    });
    for (let i = 0; i < 6; i++) {
      const x = M + i * (cw + gap);
      const fill = i === 5 ? C.accent : C.primary;
      s.addShape(pres.shapes.OVAL, {
        x: x + cw / 2 - 0.22,
        y: y0,
        w: 0.44,
        h: 0.44,
        fill: { color: fill },
        line: { color: fill },
      });
      text(s, phases[i][0], x + cw / 2 - 0.22, y0, 0.44, 0.44, {
        size: 13,
        bold: true,
        color: C.ink,
        align: "center",
        valign: "middle",
      });
      card(s, x, y0 + 0.65, cw, 2.35);
      text(s, phases[i][1], x + 0.12, y0 + 0.78, cw - 0.24, 0.3, { size: 12.5, bold: true });
      text(s, phases[i][2], x + 0.12, y0 + 1.08, cw - 0.24, 0.25, { size: 9, color: C.accent, bold: true });
      text(s, phases[i][3], x + 0.12, y0 + 1.38, cw - 0.24, 1.55, { size: 9, color: C.muted, lsm: 1.15 });
    }
    text(
      s,
      "After pilot: niche down on the corridor with most demand, add EUR collections for exporters, then Nigeria and Ghana onboarding.",
      M,
      4.85,
      W - 2 * M,
      0.3,
      { size: 10, color: C.muted, italic: true },
    );
    footer(s, n);
    s.addNotes("Full task breakdown with exit tests per phase is in docs/phases.md. Partner production onboarding starts in week 1 because it runs longest.");
  }

  // ---------------------------------------------------------------- 12 Go to market
  {
    const s = base();
    n++;
    title(s, "Go to market: trust travels by referral");
    sub(s, "Importers told us they trust what their peers use. We start with the people who already asked for this.");
    const gtm = [
      ["LuHandshake", "Pilot with the interviewees", "Four named businesses onboarded by hand at Tier 2 or 3. First live payments at small value. Their transaction data becomes our case studies."],
      ["LuUsers", "SMEs Chamber and importer peers", "Warm introductions already offered. One founder talk per month. Referral credit: a month of Meridian fees waived."],
      ["LuGlobe", "Exporters pull in foreign buyers", "Every payment link and embedded checkout puts Meridian in front of a buyer in Europe or the Gulf. Inbound is the cheapest channel."],
      ["LuBuilding2", "Mid-tier bank customers first", "Equity and Co-op business customers feel the pain most. StanChart customers do not. We target where the gap is widest."],
    ];
    const cw = 4.4;
    const ch = 1.5;
    for (let i = 0; i < 4; i++) {
      const x = M + (i % 2) * (cw + 0.2);
      const y = 1.6 + Math.floor(i / 2) * (ch + 0.18);
      card(s, x, y, cw, ch);
      await iconCircle(s, gtm[i][0], x + 0.22, y + 0.22, 0.44, i % 2 ? C.accent : C.primary);
      text(s, gtm[i][1], x + 0.8, y + 0.2, cw - 1.0, 0.32, { size: 12.5, bold: true });
      text(s, gtm[i][2], x + 0.8, y + 0.55, cw - 1.0, 0.9, { size: 9.5, color: C.muted, lsm: 1.15 });
    }
    footer(s, n);
    s.addNotes("No paid acquisition in year one. Referral, community, and the built-in distribution of payment links.");
  }

  // ---------------------------------------------------------------- 13 Team
  {
    const s = base();
    n++;
    title(s, "Team");
    sub(s, "A builder who has shipped B2B software in Kenya, and the customers who shaped the spec.");
    card(s, M, 1.65, 4.4, 3.2);
    s.addShape(pres.shapes.OVAL, {
      x: M + 0.3,
      y: 1.9,
      w: 0.9,
      h: 0.9,
      fill: { color: C.primary },
      line: { color: C.primary },
    });
    text(s, "BW", M + 0.3, 1.9, 0.9, 0.9, { size: 22, bold: true, color: C.ink, align: "center", valign: "middle" });
    text(s, "Brian Waweru", M + 1.4, 1.95, 2.8, 0.35, { size: 17, bold: true });
    text(s, "Founder. Product and engineering.", M + 1.4, 2.3, 2.8, 0.3, { size: 11, color: C.primary });
    bullets(
      s,
      [
        "Founder of Appify Softwares Limited, Nairobi.",
        "Built and shipped Eazibiz and DealerSync, B2B products for Kenyan businesses.",
        "Backend engineer on a multi-service marketplace platform: payments, notifications, compliance seeds.",
        "Ran the customer discovery behind this deck personally.",
      ],
      M + 0.3,
      2.95,
      3.85,
      1.8,
      { size: 10.5, color: C.fg, para: 4 },
    );

    card(s, 5.15, 1.65, 4.35, 1.5);
    text(s, "Advisor", 5.4, 1.8, 3, 0.3, { size: 11, bold: true, color: C.accent });
    text(s, "Bright", 5.4, 2.08, 3.8, 0.3, { size: 14, bold: true });
    text(
      s,
      "Cybersecurity trainer with clients across East and West Africa. Brought the inbound-payments use case and the liquidity and trust advice that shaped the model.",
      5.4,
      2.4,
      3.9,
      0.7,
      { size: 9.5, color: C.muted, lsm: 1.12 },
    );

    card(s, 5.15, 3.35, 4.35, 1.5);
    text(s, "Hiring with this round", 5.4, 3.5, 3, 0.3, { size: 11, bold: true, color: C.accent });
    bullets(
      s,
      [
        "Compliance lead, part-time, ex-bank or ex-fintech AML.",
        "Business development, Kenya importer communities.",
        "Second engineer after pilot.",
      ],
      5.4,
      3.82,
      3.9,
      0.95,
      { size: 10, color: C.fg, para: 3 },
    );
    footer(s, n);
    s.addNotes("Be candid: this is a solo founder today with an advisor. The round funds the first two hires.");
  }

  // ---------------------------------------------------------------- 14 The ask
  {
    const s = base();
    n++;
    title(s, "The ask");
    sub(s, "A pre-seed round to build the MVP, clear compliance, and run paid pilots for twelve months.");

    // use of funds pie (native)
    s.addChart(
      pres.charts.DOUGHNUT,
      [
        {
          name: "Use of funds",
          labels: ["Build and team", "Compliance and legal", "Partner float and fees", "Go to market", "Runway buffer"],
          values: [45, 15, 15, 10, 15],
        },
      ],
      {
        x: M,
        y: 1.55,
        w: 4.3,
        h: 3.4,
        holeSize: 55,
        chartColors: [C.primary, C.accent, "6FB8A8", "B9D9CF", "E8EFEC"],
        dataBorder: { pt: 1.5, color: C.bg },
        showPercent: true,
        showValue: false,
        dataLabelColor: C.ink,
        dataLabelFontSize: 10,
        dataLabelFontFace: FONT,
        showLegend: true,
        legendPos: "b",
        legendColor: C.fg,
        legendFontSize: 9.5,
        legendFontFace: FONT,
        showTitle: true,
        title: "Use of funds",
        titleColor: C.muted,
        titleFontSize: 10,
        titleFontFace: FONT,
      },
    );

    card(s, 5.15, 1.6, 4.35, 3.35);
    text(s, "What the round buys", 5.4, 1.75, 3.5, 0.35, { size: 15, bold: true });
    const buys = [
      ["8 weeks", "to a live pilot with four named businesses"],
      ["2 hires", "compliance lead and business development"],
      ["12 months", "of runway to reach 100 active businesses"],
      ["Legal", "AML policy, partner agreements, terms"],
    ];
    let y = 2.25;
    for (const [k, v] of buys) {
      text(s, k, 5.4, y, 1.2, 0.4, { size: 15, bold: true, color: C.primary, valign: "middle" });
      text(s, v, 6.65, y, 2.7, 0.4, { size: 10.5, color: C.muted, valign: "middle" });
      y += 0.5;
    }
    text(
      s,
      "Round size and terms in discussion. Our commitment: first live cross-border payment within 90 days of close.",
      5.4,
      4.28,
      3.9,
      0.62,
      { size: 10.5, color: C.fg, italic: true, lsm: 1.15 },
    );
    footer(s, n);
    s.addNotes(
      "Fill in the round size before sending. Use-of-funds percentages are a proposal: build and team 45%, compliance and legal 15%, partner float 15%, go to market 10%, buffer 15%.",
    );
  }

  // ---------------------------------------------------------------- 15 Close
  {
    const s = base();
    n++;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: M,
      y: 1.4,
      w: 0.55,
      h: 0.55,
      fill: { color: C.primary },
      line: { color: C.primary },
      rectRadius: 0.12,
    });
    s.addShape(pres.shapes.OVAL, {
      x: M + 0.155,
      y: 1.555,
      w: 0.24,
      h: 0.24,
      fill: { color: C.primary },
      line: { color: C.ink, width: 2 },
    });
    text(s, "African money in motion.", M, 2.15, 8, 0.8, { size: 36, bold: true });
    text(
      s,
      "Meridian moves a business's money as fast as its goods. Pay the factory today. Get paid by the buyer today. Know the cost before you press send.",
      M,
      3.0,
      6.5,
      0.9,
      { size: 14, color: C.muted, lsm: 1.15 },
    );
    text(s, "Brian Waweru  ·  Founder, Appify Softwares Limited", M, 4.15, 7, 0.3, { size: 12, bold: true });
    text(s, "appify.co.ke  ·  Nairobi, Kenya  ·  github.com/dexterbrian/meridian", M, 4.45, 7, 0.3, {
      size: 11,
      color: C.primary,
    });
    s.addNotes("Close with the milestone: first live cross-border payment within 90 days of close.");
  }

  await pres.writeFile({ fileName: OUT });
  console.log("wrote", OUT, "slides:", n);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
