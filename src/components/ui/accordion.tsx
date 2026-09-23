import { Accordion as KAccordion } from "@kobalte/core/accordion";
import ChevronDown from "lucide-solid/icons/chevron-down";
import type { JSX } from "solid-js";

// Kobalte accordion styled to match the previous site exactly.

export function Accordion(props: { class?: string; children: JSX.Element }) {
  return (
    <KAccordion collapsible class={props.class}>
      {props.children}
    </KAccordion>
  );
}

export function AccordionItem(props: { value: string; children: JSX.Element }) {
  return (
    <KAccordion.Item value={props.value} class="border-b">
      {props.children}
    </KAccordion.Item>
  );
}

export function AccordionTrigger(props: { class?: string; children: JSX.Element }) {
  return (
    <KAccordion.Header class="flex">
      <KAccordion.Trigger
        class={`group flex flex-1 cursor-pointer items-center justify-between py-4 text-left text-sm font-medium transition-all hover:underline ${props.class ?? ""}`}
      >
        {props.children}
        <ChevronDown class="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[expanded]:rotate-180" />
      </KAccordion.Trigger>
    </KAccordion.Header>
  );
}

export function AccordionContent(props: { class?: string; children: JSX.Element }) {
  return (
    <KAccordion.Content class="overflow-hidden text-sm data-[closed]:animate-accordion-up data-[expanded]:animate-accordion-down">
      <div class={`pb-4 pt-0 ${props.class ?? ""}`}>{props.children}</div>
    </KAccordion.Content>
  );
}
