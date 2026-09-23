import { Title } from "@solidjs/meta";

// Placeholder dashboard. Phase 1 adds tier, limits, KYB status and next steps.
export default function Dashboard() {
  return (
    <main class="mx-auto max-w-6xl px-5 py-12">
      <Title>Dashboard — Meridian</Title>
      <h1 class="font-display text-3xl font-bold">Welcome to Meridian</h1>
      <p class="mt-2 max-w-2xl text-muted-foreground">
        Your account is ready. Business onboarding opens here soon: your profile, your documents,
        and your payment limits.
      </p>
    </main>
  );
}
