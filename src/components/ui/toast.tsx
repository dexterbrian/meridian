import { Toast, toaster } from "@kobalte/core/toast";
import { Portal } from "solid-js/web";

// Kobalte toasts, top-centre, with success and error colours like before.

type Tone = "success" | "error";

const TONE: Record<Tone, string> = {
  success: "border-success/40 bg-success/15 text-success",
  error: "border-destructive/40 bg-destructive/15 text-destructive",
};

function show(tone: Tone, message: string) {
  toaster.show((props) => (
    <Toast
      toastId={props.toastId}
      duration={4000}
      class={`toast pointer-events-auto rounded-lg border px-4 py-3 text-sm font-medium shadow-lg backdrop-blur ${TONE[tone]}`}
    >
      <Toast.Title>{message}</Toast.Title>
    </Toast>
  ));
}

export const toast = {
  success: (message: string) => show("success", message),
  error: (message: string) => show("error", message),
};

export function Toaster() {
  return (
    <Portal>
      <Toast.Region swipeDirection="up">
        <Toast.List class="pointer-events-none fixed left-1/2 top-4 z-[100] flex w-[356px] max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col gap-2" />
      </Toast.Region>
    </Portal>
  );
}
