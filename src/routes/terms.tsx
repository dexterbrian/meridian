import { Meta, Title } from "@solidjs/meta";
import { DemoBanner } from "~/components/site/banner";
import { SiteFooter } from "~/components/site/footer";
import { SiteHeader } from "~/components/site/header";
import { LEGAL_EFFECTIVE_DATE } from "~/lib/legal";

export default function TermsPage() {
  return (
    <>
      <Title>Terms of Service — Meridian</Title>
      <Meta
        name="description"
        content="Terms of Service for Meridian, a product of Appify Softwares Limited. Meridian is a technology platform under development; regulated partners handle all money movement."
      />
      <Meta property="og:title" content="Terms of Service — Meridian" />
      <Meta
        property="og:description"
        content="Terms of Service for Meridian, a product of Appify Softwares Limited."
      />
      <Meta name="twitter:card" content="summary" />
      <DemoBanner />
      <SiteHeader />
      <main class="mx-auto max-w-3xl px-5 py-16">
        <h1 class="font-display text-3xl font-semibold tracking-tight md:text-4xl">
          Terms of Service
        </h1>
        <p class="mt-3 text-sm text-muted-foreground">Effective date: {LEGAL_EFFECTIVE_DATE}</p>

        <section class="mt-10 space-y-6 text-sm leading-7 text-muted-foreground">
          <p>
            These Terms of Service (“Terms”) govern your access to and use of the Meridian website
            and any related demo pages, waitlist forms, and contact tools (collectively, the
            “Service”). Meridian is a product of{" "}
            <strong class="text-foreground">Appify Softwares Limited</strong> (“Appify”, “we”, “us”,
            or “our”), a technology company based in Nairobi, Kenya. By using the Service, you agree
            to be bound by these Terms.
          </p>

          <h2 class="font-display text-lg font-semibold text-foreground">
            1. The product is under development
          </h2>
          <p>
            Meridian is currently under active development. Nothing on this site is a live financial
            service. All demonstrations, calculators, forms, and example transactions are
            simulations intended to illustrate how Meridian may work once launched. No real funds
            are held, moved, or settled through this website.
          </p>

          <h2 class="font-display text-lg font-semibold text-foreground">
            2. Meridian is a technology platform
          </h2>
          <p>
            Meridian is strictly a software and technology platform provider. We do not handle
            client money, provide banking services, issue e-money, or operate a payment system. Any
            future movement of funds will be performed by regulated, licensed financial
            infrastructure partners. Those partners’ terms and conditions will apply to any payment,
            payout, or settlement service they provide.
          </p>

          <h2 class="font-display text-lg font-semibold text-foreground">
            3. Eligibility and acceptable use
          </h2>
          <p>
            You must be at least 18 years old and legally able to enter into contracts to use the
            Service. You agree not to misuse the Service, submit false information, attempt to
            interfere with the site, or use it for any unlawful purpose.
          </p>

          <h2 class="font-display text-lg font-semibold text-foreground">
            4. Waitlist and contact submissions
          </h2>
          <p>
            When you join the waitlist or submit a contact form, you provide your name, email
            address, company name, and related details. We will use this information to contact you
            about Meridian, respond to your enquiry, and notify you when the product is available.
            Submission does not create a contractual right to access Meridian before launch.
          </p>

          <h2 class="font-display text-lg font-semibold text-foreground">5. Demo transactions</h2>
          <p>
            Demo checkout, cross-border send, and payment-request flows produce simulated receipts
            and confirmation emails for illustration only. Fees shown are indicative and based on
            publicly available or estimated partner pricing. Final fees, currencies, and partner
            rails will be confirmed before any commercial launch.
          </p>

          <h2 class="font-display text-lg font-semibold text-foreground">
            6. Intellectual property
          </h2>
          <p>
            All content, branding, designs, code, and materials on the Service are owned by Appify
            Softwares Limited or its licensors and are protected by copyright, trademark, and other
            laws. You may not copy, modify, distribute, or reverse-engineer any part of the Service
            without our written permission.
          </p>

          <h2 class="font-display text-lg font-semibold text-foreground">7. Disclaimers</h2>
          <p>
            The Service is provided “as is” and “as available” without warranties of any kind.
            Because Meridian is not yet live, we do not guarantee that any feature, fee, timeline,
            or partner described here will be available in the final product.
          </p>

          <h2 class="font-display text-lg font-semibold text-foreground">
            8. Limitation of liability
          </h2>
          <p>
            To the fullest extent permitted by law, Appify Softwares Limited and its affiliates,
            officers, employees, and agents will not be liable for any indirect, incidental,
            special, consequential, or punitive damages arising out of or relating to your use of
            the Service.
          </p>

          <h2 class="font-display text-lg font-semibold text-foreground">
            9. Changes to these Terms
          </h2>
          <p>
            We may update these Terms from time to time. The updated version will be posted on this
            page with a revised effective date. Continued use of the Service after changes means you
            accept the revised Terms.
          </p>

          <h2 class="font-display text-lg font-semibold text-foreground">10. Governing law</h2>
          <p>
            These Terms are governed by the laws of the Republic of Kenya. Any dispute arising from
            these Terms or your use of the Service will be subject to the exclusive jurisdiction of
            the courts of Kenya.
          </p>

          <h2 class="font-display text-lg font-semibold text-foreground">11. Contact us</h2>
          <p>
            For questions about these Terms, please contact us through the contact form on this site
            or via{" "}
            <a
              href="https://appify.co.ke"
              target="_blank"
              rel="noreferrer"
              class="text-primary hover:underline"
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
