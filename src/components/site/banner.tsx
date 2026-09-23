import type { JSX } from "solid-js";

export function DemoBanner(props: { children?: JSX.Element }) {
  return (
    <div class="border-b border-accent/30 bg-accent/10 px-4 py-2.5 text-center text-xs font-medium text-accent sm:text-sm">
      {props.children ?? <>Demo. No real money moves. Meridian is under development.</>}
    </div>
  );
}
