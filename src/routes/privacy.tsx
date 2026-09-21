import { createFileRoute } from "@tanstack/react-router";
import { DemoBanner, SiteFooter, SiteHeader } from "@/components/site-chrome";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Meridian" },
      {
        name: "description",
        content:
          "Privacy Policy for Meridian, a product of Appify Softwares Limited. Learn what data we collect, how we use it, and your rights.",
      },
      { property: "og:title", content: "Privacy Policy — Meridian" },
      {
        property: "og:description",
        content:
          "Privacy Policy for Meridian, a product of Appify Softwares Limited.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const effectiveDate = "14 September 2026";

  return (
    <>
      <DemoBanner />
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-16">
      <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
        Privacy Policy
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Effective date: {effectiveDate}
      </p>

      <section className="mt-10 space-y-6 text-sm leading-7 text-muted-foreground">
        <p>
          This Privacy Policy explains how{" "}
          <strong className="text-foreground">Appify Softwares Limited</strong>{" "}
          (“Appify”, “we”, “us”, or “our”) collects, uses, stores, and protects
          personal information through the Meridian website and demo tools
          (collectively, the “Service”).
        </p>

        <h2 className="font-display text-lg font-semibold text-foreground">
          1. Information we collect
        </h2>
        <p>
          We collect information you provide directly, such as your name,
          email address, company or business name, country, estimated monthly
          transaction volume, and any message you include in a contact or
          waitlist form. We also collect technical information automatically,
          including your IP address, browser type, device information, and
          pages visited, through standard analytics and server logs.
        </p>

        <h2 className="font-display text-lg font-semibold text-foreground">
          2. How we use your information
        </h2>
        <p>We use the information we collect to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Respond to your enquiries and support requests;</li>
          <li>Manage the waitlist and notify you when Meridian launches;</li>
          <li>Improve the Service, analyse usage trends, and fix issues;</li>
          <li>Comply with legal obligations and protect our rights; and</li>
          <li>Send you product updates and marketing communications, which you can opt out of at any time.</li>
        </ul>

        <h2 className="font-display text-lg font-semibold text-foreground">
          3. Demo transactions and financial data
        </h2>
        <p>
          Demo checkout, cross-border send, and payment-request flows do not
          process real money. Any “payer”, “merchant”, or transaction details you
          enter are stored only as demonstration records and are not linked to
          real accounts or financial instruments. We do not collect bank
          credentials, card numbers, or wallet keys through the Service.
        </p>

        <h2 className="font-display text-lg font-semibold text-foreground">
          4. Legal basis for processing
        </h2>
        <p>
          We process your personal information on the basis of your consent
          (when you submit a form), our legitimate interest in operating and
          improving the Service, and compliance with applicable laws.
        </p>

        <h2 className="font-display text-lg font-semibold text-foreground">
          5. Sharing your information
        </h2>
        <p>
          We do not sell your personal information. We may share it with trusted
          service providers who help us operate the Service (such as hosting,
          analytics, and email delivery providers), and with regulated
          financial infrastructure partners only where necessary to provide
          future payment services. We may also disclose information if required
          by law or to protect our rights.
        </p>

        <h2 className="font-display text-lg font-semibold text-foreground">
          6. Data retention
        </h2>
        <p>
          We keep your personal information for as long as necessary to fulfil
          the purposes described in this Policy, or as required by law. You may
          request deletion of your information at any time by contacting us.
        </p>

        <h2 className="font-display text-lg font-semibold text-foreground">
          7. Your rights
        </h2>
        <p>
          Depending on your location, you may have the right to access, correct,
          delete, restrict, or object to the processing of your personal
          information, and to withdraw consent. To exercise these rights, contact
          us through the contact form on this site.
        </p>

        <h2 className="font-display text-lg font-semibold text-foreground">
          8. Security
        </h2>
        <p>
          We take reasonable technical and organisational measures to protect
          your information from unauthorised access, loss, or misuse. However, no
          online service is completely secure, and we cannot guarantee
          absolute security.
        </p>

        <h2 className="font-display text-lg font-semibold text-foreground">
          9. International transfers
        </h2>
        <p>
          Some of our service providers may process data outside your country
          of residence. When this happens, we ensure appropriate safeguards are
          in place, such as standard contractual clauses or equivalent legal
          mechanisms.
        </p>

        <h2 className="font-display text-lg font-semibold text-foreground">
          10. Changes to this Policy
        </h2>
        <p>
          We may update this Privacy Policy from time to time. The updated
          version will be posted on this page with a revised effective date.
          Continued use of the Service after changes means you accept the
          revised Policy.
        </p>

        <h2 className="font-display text-lg font-semibold text-foreground">
          11. Contact us
        </h2>
        <p>
          If you have any questions about this Privacy Policy or how we handle
          your data, please contact us through the contact form on this site or
          via{" "}
          <a
            href="https://appify.co.ke"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            appify.co.ke
          </a>
          .
        </p>
      </section>
    </main>
    <SiteFooter />
    </>
  );
}
