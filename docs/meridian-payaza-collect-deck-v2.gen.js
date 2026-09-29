// Meridian Collect: hackathon deck, v2. Updated after building on Payaza's
// sandbox and hearing back from Payaza's team (29 September 2026):
//   - Payaza converts no currencies, for payouts, transfers or split settlement,
//     so a payment pays out only in the currency the payer paid in.
//   - Payaza has no USD payouts, so USD card payments can't reach a business.
//   - Split settlement is not used: Meridian is the Payaza merchant, so its 1%
//     already stays in its own balance.
//   - The payer covers the fees on top, so the business gets the exact amount.
// The original deck (meridian-payaza-collect-deck.pptx and its .gen.js) is left as is.
// Run: node meridian-payaza-collect-deck-v2.gen.js [out.pptx]
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const Lu = require("react-icons/lu");

// Palette from the Meridian design system (styles.css), converted to hex.
const C = {
  bg: "0F2624",
  surface: "173432",
  surface2: "1E403D",
  fg: "F2F7F4",
  muted: "9FB8B2",
  primary: "3ECFA0",
  accent: "E5C158",
  danger: "E58A7A",
  ink: "0B1A19",
};
const FONT = "Calibri";
const OUT = process.argv[2] || "meridian-payaza-collect-deck-v2.pptx";

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
pres.title = "Meridian Collect — Payaza Borderless Kenya Hackathon";

const W = 10;
const H = 5.625;
const M = 0.5;

function base() {
  const s = pres.addSlide();
  s.background = { color: C.bg };
  return s;
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
    lineSpacingMultiple: o.lsm || 1.05,
  });
}

function title(s, str, subStr) {
  text(s, str, M, 0.38, W - 2 * M, 0.6, { size: 28, bold: true });
  if (subStr) text(s, subStr, M, 0.98, W - 2 * M, 0.4, { size: 14, color: C.muted });
}

function footer(s, n) {
  text(s, "Meridian Collect  ·  Appify Softwares Limited  ·  Payaza Borderless Kenya Hackathon 2026", M, H - 0.38, 7, 0.25, {
    size: 8,
    color: C.muted,
  });
  text(s, String(n), W - M - 0.6, H - 0.38, 0.6, 0.25, { size: 8, color: C.muted, align: "right" });
}

function card(s, x, y, w, h, fill = C.surface) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: fill }, line: { color: fill }, rectRadius: 0.08 });
}

async function iconCircle(s, name, x, y, d = 0.5, fill = C.primary, iconColor = C.ink) {
  s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill } });
  const pad = d * 0.24;
  s.addImage({ data: await icon(name, iconColor), x: x + pad, y: y + pad, w: d - 2 * pad, h: d - 2 * pad });
}

function bullets(s, items, x, y, w, h, o = {}) {
  s.addText(
    items.map((t, i) => ({
      text: t,
      options: { bullet: { indent: 12 }, breakLine: i < items.length - 1, paraSpaceAfter: o.para || 5 },
    })),
    { x, y, w, h, fontFace: FONT, fontSize: o.size || 12, color: o.color || C.fg, valign: "top", isTextBox: true, margin: 0 },
  );
}

(async () => {
  let n = 0;

  // ------------------------------------------------------------ 1 Title
  {
    const s = base();
    n++;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: M, y: 0.6, w: 0.55, h: 0.55, fill: { color: C.primary }, line: { color: C.primary }, rectRadius: 0.12 });
    s.addShape(pres.shapes.OVAL, { x: M + 0.155, y: 0.755, w: 0.24, h: 0.24, fill: { color: C.primary }, line: { color: C.ink, width: 2 } });
    text(s, "Meridian Collect", M + 0.7, 0.62, 4, 0.5, { size: 22, bold: true });
    text(s, "Exporters get paid\nthe exact amount they\ninvoiced. Same day.", M, 1.6, 5.9, 1.6, { size: 28, bold: true, lsm: 1.0 });
    text(
      s,
      "Send a buyer a payment link. They pay the way they already do: M-Pesa, MTN MoMo, bank transfer or card, with every fee shown first. The fees go on top, so the exporter receives exactly what they invoiced. Built on Payaza.",
      M,
      3.3,
      5.6,
      1.1,
      { size: 13, color: C.muted },
    );
    text(s, "Track: SME and exporter collections  ·  Appify Softwares Limited, Nairobi  ·  September 2026", M, 4.8, 8, 0.3, {
      size: 10,
      color: C.muted,
    });

    // sample invoice card
    card(s, 6.7, 1.45, 2.8, 3.1);
    text(s, "INVOICE AF-0917  ·  PAID", 6.85, 1.62, 2.5, 0.25, { size: 8, color: C.primary, bold: true });
    text(s, "Buyer pays, fees on top", 6.85, 1.92, 2.5, 0.22, { size: 9, color: C.muted });
    text(s, "KES 670,104 by M-Pesa", 6.85, 2.14, 2.5, 0.35, { size: 16, bold: true });
    s.addShape(pres.shapes.LINE, { x: 6.95, y: 2.6, w: 0, h: 0.75, line: { color: C.primary, width: 1.5 } });
    text(s, "Payaza confirms payment\nMeridian checks it\nPayaza pays out same day", 7.1, 2.58, 2.3, 0.8, { size: 9, color: C.muted, lsm: 1.2 });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 6.85,
      y: 3.5,
      w: 2.5,
      h: 0.72,
      fill: { color: C.surface2 },
      line: { color: C.primary, width: 0.75 },
      rectRadius: 0.06,
    });
    text(s, "Nairobi flower exporter receives", 6.97, 3.56, 2.3, 0.22, { size: 8, color: C.muted });
    text(s, "KES 650,000", 6.97, 3.76, 2.3, 0.4, { size: 18, bold: true, color: C.primary });
    text(s, "Exactly what was invoiced.", 6.85, 4.28, 2.6, 0.22, { size: 8, color: C.muted });
    footer(s, n);
    s.addNotes(
      "Meridian Collect lets an exporter send a payment link. The buyer pays the way they already do, sees every fee before paying, and covers the fees on top. So the exporter receives exactly the amount on the invoice, the same day. Payaza runs every money step.",
    );
  }

  // ------------------------------------------------------------ 2 Problem
  {
    const s = base();
    n++;
    title(s, "Two exporters. The same problem.", "From our customer interviews, September 2026.");

    card(s, M, 1.55, 3.0, 3.3, C.surface2);
    text(s, "THE HACKATHON CHALLENGE", M + 0.2, 1.72, 2.6, 0.25, { size: 8, bold: true, color: C.accent });
    text(
      s,
      "“Small exporters in agriculture, crafts and digital services struggle to collect from international buyers without expensive intermediaries.”",
      M + 0.2,
      2.05,
      2.6,
      1.9,
      { size: 14, italic: true, lsm: 1.15 },
    );
    text(s, "Payaza Borderless Kenya, track 3", M + 0.2, 4.35, 2.6, 0.25, { size: 9, color: C.muted });

    const people = [
      {
        ic: "LuApple",
        name: "Chris, fresh produce exporter",
        tag: "Avocados to Europe, Egypt, Middle East, Asia",
        pts: [
          "USD 35,000 to 40,000 per weekly shipment.",
          "2 to 3 days to clear from Europe. Gulf banks shut Fridays.",
          "Buyers hold payment until they like the FX rate.",
          "Late money means cold storage bills and farmers left unpaid at harvest.",
        ],
      },
      {
        ic: "LuFlower2",
        name: "Ann, flower exporter",
        tag: "Flowers to Ghana, Nigeria, Namibia, Côte d’Ivoire",
        pts: [
          "Bank transfers take 1 to 3 working days to clear.",
          "She loses money on FX between invoice and payment.",
          "Flowers are perishable. Cash is tied up while stock ships.",
        ],
      },
    ];
    let x = 3.75;
    for (const p of people) {
      card(s, x, 1.55, 2.75, 3.3);
      await iconCircle(s, p.ic, x + 0.2, 1.72, 0.45);
      text(s, p.name, x + 0.75, 1.72, 1.9, 0.45, { size: 12, bold: true, valign: "middle" });
      text(s, p.tag, x + 0.2, 2.28, 2.4, 0.4, { size: 9, color: C.muted });
      bullets(s, p.pts, x + 0.2, 2.75, 2.4, 2.0, { size: 11 });
      x += 2.9;
    }
    footer(s, n);
    s.addNotes(
      "This is the exact problem in the hackathon's collections track. Chris ships avocados weekly and waits 2 to 3 days for European payments. Ann exports flowers across Africa and waits 1 to 3 days, and loses money when the exchange rate moves. A third flower exporter, referred by an advisor, has the same issue.",
    );
  }

  // ------------------------------------------------------------ 3 Cost
  {
    const s = base();
    n++;
    title(s, "Slow money is expensive money", "What the delay costs an exporter, in their own words.");
    const stats = [
      { big: "1–3 days", label: "for a buyer’s bank transfer to clear. Ann, every order.", color: C.accent },
      { big: "$40k", label: "stuck per shipment while Chris waits 2 to 3 days on Europe.", color: C.accent },
      { big: "FX loss", label: "when the rate moves between invoice and payment. Buyers stall for a better rate.", color: C.danger },
    ];
    let x = M;
    for (const st of stats) {
      card(s, x, 1.55, 2.85, 1.85);
      text(s, st.big, x + 0.25, 1.72, 2.4, 0.8, { size: 36, bold: true, color: st.color });
      text(s, st.label, x + 0.25, 2.55, 2.4, 0.75, { size: 12, color: C.muted });
      x += 3.075;
    }
    await iconCircle(s, "LuTriangleAlert", M, 3.8, 0.45, C.surface2, C.accent);
    text(s, "The knock-on effect is the real cost.", M + 0.65, 3.78, 8, 0.3, { size: 14, bold: true });
    text(
      s,
      "Cold storage keeps running. Farmers must be paid at harvest. A missed sailing waits a week. Flowers wilt. Small exporters carry all of that because the money has not landed.",
      M + 0.65,
      4.12,
      8.3,
      0.7,
      { size: 12, color: C.muted },
    );
    footer(s, n);
    s.addNotes(
      "Fees are not the main pain for these exporters. Time and exchange-rate risk are. And the damage cascades: cold storage, paying farmers, missing a ship.",
    );
  }

  // ------------------------------------------------------------ 4 How it works
  {
    const s = base();
    n++;
    title(s, "How Meridian Collect works", "Four steps. The exporter only does the first one.");
    const steps = [
      {
        ic: "LuFileText",
        h: "1. Request the amount",
        b: "Exporter enters what they want to receive, say KES 650,000, with their own invoice number. Gets a link with a Meridian reference.",
      },
      {
        ic: "LuSmartphone",
        h: "2. Buyer pays their way",
        b: "M-Pesa, MTN MoMo, bank transfer or card. Every fee is shown before paying, and the buyer covers it on top.",
      },
      {
        ic: "LuShieldCheck",
        h: "3. Confirmed and checked",
        b: "Payaza confirms. Meridian double-checks with Payaza and runs its checks. Nobody is charged or paid twice.",
      },
      {
        ic: "LuBanknote",
        h: "4. Paid out same day",
        b: "The exact invoiced amount goes to the exporter’s M-Pesa or bank. Receipts to both sides carry the invoice number.",
      },
    ];
    const cw = 2.05;
    const gap = 0.2;
    let x = M;
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i];
      card(s, x, 1.6, cw, 2.75);
      await iconCircle(s, st.ic, x + 0.2, 1.8, 0.5);
      text(s, st.h, x + 0.2, 2.45, cw - 0.4, 0.5, { size: 13, bold: true });
      text(s, st.b, x + 0.2, 2.98, cw - 0.4, 1.3, { size: 10.5, color: C.muted });
      x += cw + gap;
    }
    text(
      s,
      "Pricing: flat 1% plus Payaza’s fee, both paid by the buyer and shown up front. The buyer pays in the exporter’s currency, and the payout is in that same currency.",
      M,
      4.55,
      W - 2 * M,
      0.45,
      { size: 12, color: C.primary },
    );
    footer(s, n);
    s.addNotes(
      "The exporter sets the amount they want to receive. The buyer pays that plus the fees, using the method they already have. Payaza confirms, Meridian checks, and the exporter is paid the exact amount the same day. Payaza does not convert currencies, so the buyer pays in the currency the exporter is paid out in.",
    );
  }

  // ------------------------------------------------------------ 5 Payaza
  {
    const s = base();
    n++;
    title(s, "Payaza does the heavy lifting", "Every money step runs on Payaza’s APIs. Built and run in its sandbox.");
    const items = [
      { ic: "LuSmartphone", h: "Mobile money collections", b: "M-Pesa in Kenya, and MoMo wallets in Uganda, Tanzania, Ghana and more." },
      { ic: "LuLandmark", h: "NGN virtual accounts", b: "Nigerian buyers pay by bank transfer to a one-off account that expires." },
      { ic: "LuCreditCard", h: "Web Checkout for cards", b: "Visa, Mastercard and Verve in NGN, 3DS secured. Card numbers never touch Meridian." },
      { ic: "LuUserCheck", h: "Account name enquiry", b: "The exporter’s payout account is checked against their business name before it’s saved." },
      { ic: "LuSend", h: "Transfers", b: "Pays the exporter out to M-Pesa or bank, in their currency, the moment a payment is confirmed." },
      { ic: "LuActivity", h: "Webhooks + status queries", b: "Every payment confirmed twice, and a live timeline from “Paid” to “Settled”." },
    ];
    const cw = 2.85;
    const ch = 1.3;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = M + col * (cw + 0.225);
      const y = 1.55 + row * (ch + 0.2);
      card(s, x, y, cw, ch);
      await iconCircle(s, it.ic, x + 0.18, y + 0.2, 0.42);
      text(s, it.h, x + 0.72, y + 0.2, cw - 0.85, 0.42, { size: 12, bold: true, valign: "middle" });
      text(s, it.b, x + 0.18, y + 0.72, cw - 0.36, 0.55, { size: 10.5, color: C.muted });
    }
    text(s, "Meridian adds the exporter experience: exact amounts, invoice numbers, fee transparency, checks and receipts.", M, 4.6, W - 2 * M, 0.35, {
      size: 11,
      color: C.muted,
      italic: true,
    });
    footer(s, n);
    s.addNotes(
      "Payaza is not bolted on. It collects, confirms, checks account names and pays out. Meridian adds exact amounts, invoice numbers, fee transparency, compliance checks, a clear timeline and receipts. We ran the full flow in Payaza's sandbox.",
    );
  }

  // ------------------------------------------------------------ 6 Ann's order
  {
    const s = base();
    n++;
    title(s, "Ann’s next order, end to end", "Illustrative. A buyer pays in KES by M-Pesa for flowers worth KES 650,000.");
    const rows = [
      ["9:00", "Ann requests KES 650,000 with her invoice number AF-0917 and sends the link on WhatsApp."],
      ["9:40", "Her buyer opens it, sees KES 20,104 in fees, and pays KES 670,104 by M-Pesa."],
      ["9:41", "Payaza confirms. Meridian’s checks pass. Timeline shows “Paid”."],
      ["Same day", "Ann’s M-Pesa receives KES 650,000, exactly what she invoiced."],
    ];
    let y = 1.55;
    for (const [t, d] of rows) {
      s.addShape(pres.shapes.OVAL, { x: M + 1.18, y: y + 0.1, w: 0.16, h: 0.16, fill: { color: C.primary }, line: { color: C.primary } });
      text(s, t, M, y + 0.03, 1.05, 0.3, { size: 13, bold: true, color: C.primary, align: "right" });
      text(s, d, M + 1.5, y + 0.03, 4.0, 0.6, { size: 12 });
      y += 0.72;
    }
    s.addShape(pres.shapes.LINE, { x: M + 1.26, y: 1.75, w: 0, h: 2.2, line: { color: C.surface2, width: 1.5 } });

    card(s, 6.3, 1.55, 3.2, 3.0);
    text(s, "TODAY vs WITH MERIDIAN", 6.5, 1.72, 2.8, 0.25, { size: 8, bold: true, color: C.accent });
    const cmp = [
      ["Money lands", "1–3 days", "Same day"],
      ["Fees", "Off Ann’s money", "Paid by buyer"],
      ["Buyer pays by", "Bank wire", "M-Pesa, MoMo, card"],
      ["Tracking", "Call the bank", "Live timeline"],
    ];
    let cy = 2.1;
    for (const [k, a, b] of cmp) {
      text(s, k, 6.5, cy, 1.05, 0.5, { size: 10, color: C.muted });
      text(s, a, 7.55, cy, 0.85, 0.5, { size: 10, color: C.danger });
      text(s, b, 8.4, cy, 1.0, 0.5, { size: 10, bold: true, color: C.primary });
      cy += 0.58;
    }
    footer(s, n);
    s.addNotes(
      "One concrete order, the one we demo live in Payaza's sandbox. The buyer uses M-Pesa and sees every fee first. Ann gets exactly KES 650,000 the same day. Sending the same Payaza confirmation twice changes nothing, and a paid link can't be paid again.",
    );
  }

  // ------------------------------------------------------------ 7 Pilot
  {
    const s = base();
    n++;
    title(s, "Ready to pilot", "Real users are waiting. The collection flow is built.");
    const cols = [
      {
        ic: "LuUsers",
        h: "First users lined up",
        pts: ["Chris, avocado exporter", "Ann, flower exporter", "A second flower exporter via a referral", "SMEs Chamber of Kenya members, via Chris"],
      },
      {
        ic: "LuHammer",
        h: "Built in the hackathon",
        pts: [
          "Business sign-up and payout accounts, name-checked",
          "Payment requests with invoice numbers",
          "M-Pesa, bank transfer and card via Payaza",
          "Same-day payouts, timeline, receipts, admin",
        ],
      },
      {
        ic: "LuTrendingUp",
        h: "The business",
        pts: ["Flat 1% per collection, paid by the buyer", "Chris alone moves about USD 150k a month", "Next: pay suppliers abroad from the same account"],
      },
    ];
    let x = M;
    for (const c of cols) {
      card(s, x, 1.55, 2.85, 3.2);
      await iconCircle(s, c.ic, x + 0.2, 1.72, 0.45);
      text(s, c.h, x + 0.78, 1.72, 1.95, 0.45, { size: 13, bold: true, valign: "middle" });
      bullets(s, c.pts, x + 0.2, 2.35, 2.45, 2.3, { size: 11.5 });
      x += 3.075;
    }
    footer(s, n);
    s.addNotes(
      "We have exporters ready to try it, and the full collection flow is built on Payaza and tested in its sandbox. Revenue is a flat 1% per collection, paid by the buyer. Paying suppliers abroad comes next.",
    );
  }

  // ------------------------------------------------------------ 8 The ask
  {
    const s = base();
    n++;
    title(s, "What unlocks the rest", "Two Payaza features turn this into true cross-border collection.");

    const asks = [
      {
        ic: "LuArrowLeftRight",
        h: "Currency conversion",
        b: "Today a payment pays out only in the currency it was paid in. With conversion, Ann’s buyer in Accra pays in cedis and Ann still receives shillings.",
      },
      {
        ic: "LuDollarSign",
        h: "USD payouts",
        b: "Payaza takes cards in USD but can’t pay USD out. With USD payouts, Chris’s European buyers and AfricaHackon’s students in South Sudan can pay by card.",
      },
    ];
    let x = M;
    for (const a of asks) {
      card(s, x, 1.55, 4.4, 2.1);
      await iconCircle(s, a.ic, x + 0.25, 1.75, 0.5, C.accent, C.ink);
      text(s, a.h, x + 0.9, 1.75, 3.3, 0.5, { size: 15, bold: true, valign: "middle" });
      text(s, a.b, x + 0.25, 2.45, 3.9, 1.1, { size: 11.5, color: C.muted });
      x += 4.6;
    }

    card(s, M, 3.85, W - 2 * M, 0.95, C.surface2);
    text(s, "WHAT WORKS TODAY", M + 0.25, 3.97, 3, 0.25, { size: 8, bold: true, color: C.primary });
    text(
      s,
      "Any business paid in the currency its buyer pays in: KES, UGX, TZS, NGN, GHS and more. Exact amount, fees on top, same day. We’ve shared our sandbox findings with Payaza’s team.",
      M + 0.25,
      4.22,
      W - 2 * M - 0.5,
      0.55,
      { size: 11.5 },
    );
    footer(s, n);
    s.addNotes(
      "We are honest about the edge. Payaza confirmed it doesn't convert currencies and doesn't pay out in USD. So today a business is paid in the currency its buyer pays in. Those two features would let Ann's Ghanaian buyers and Chris's European buyers pay the way they want while the exporter still receives shillings. That's what we'd build with Payaza next.",
    );
  }

  await pres.writeFile({ fileName: OUT });
  console.log("wrote " + OUT);
})();
