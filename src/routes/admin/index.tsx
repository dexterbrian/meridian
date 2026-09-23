import { Title } from "@solidjs/meta";

// Placeholder. Phase 1 adds the KYB queue; Phase 2 the flag queue.
export default function AdminHome() {
  return (
    <main class="mx-auto max-w-6xl px-5 py-12">
      <Title>Admin — Meridian</Title>
      <h1 class="font-display text-3xl font-bold">Admin</h1>
      <p class="mt-2 text-muted-foreground">The KYB and flag queues will live here.</p>
    </main>
  );
}
