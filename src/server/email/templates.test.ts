import { describe, expect, it } from "vitest";
import {
  contactConfirmation,
  demoEmail,
  leadAlert,
  waitlistConfirmEmail,
  waitlistWelcome,
} from "./templates";

const waitlist = {
  business_name: "Kilimo Fresh Exports Ltd",
  contact_name: "Amina Wanjiru",
  email: "amina@kilimo.co.ke",
  country: "Kenya",
  monthly_volume: "$10,000 – $50,000",
  pain_point: "We pay a packaging supplier in Ghana <monthly>.",
};

describe("email templates", () => {
  it("asks a new waitlist signup to confirm, with one button and the link in plain text", () => {
    const e = waitlistConfirmEmail({
      contactName: "Amina <b>Wanjiru</b>",
      businessName: "Kilimo & Sons",
      confirmUrl: "https://meridian.appify.co.ke/waitlist/confirm?token=abc&x=1",
    });
    expect(e.subject).toBe("Confirm your place on the Meridian waitlist");
    expect(e.html.match(/Confirm my place/g)).toHaveLength(1);
    expect(e.html).toContain(
      'href="https://meridian.appify.co.ke/waitlist/confirm?token=abc&amp;x=1"',
    );
    expect(e.html).toContain("Kilimo &amp; Sons");
    expect(e.text).toContain(
      "Confirm my place: https://meridian.appify.co.ke/waitlist/confirm?token=abc&x=1",
    );
  });

  it("greets the waitlist signup by first name once they confirm", () => {
    const e = waitlistWelcome(waitlist);
    expect(e.subject).toBe("You're on the Meridian waitlist");
    expect(e.html).toContain("Welcome aboard, Amina");
    expect(e.text).toContain("Business: Kilimo Fresh Exports Ltd");
    expect(e.html).not.toContain("no money moved");
  });

  it("escapes user input in HTML", () => {
    const e = leadAlert({ kind: "waitlist", data: waitlist });
    expect(e.html).toContain("&lt;monthly&gt;");
    expect(e.html).not.toContain("<monthly>");
    expect(e.subject).toBe("New waitlist signup: Kilimo Fresh Exports Ltd");
  });

  it("builds a contact confirmation and lead alert", () => {
    const c = {
      name: "Otieno",
      email: "o@example.com",
      company: "",
      subject: "",
      message: "Do you cover Juba?",
    };
    expect(contactConfirmation(c).html).toContain("General enquiry");
    expect(contactConfirmation(c).html).toContain("—");
    const alert = leadAlert({ kind: "contact", data: c });
    expect(alert.subject).toBe("New contact message: General enquiry");
    expect(alert.text).toContain("Email: o@example.com");
  });

  it("marks demo emails as demo", () => {
    const e = demoEmail({ subject: "s", heading: "h", intro: "i", rows: [] });
    expect(e.html).toContain("demo environment");
    expect(e.html).toContain("no money moved");
  });
});
