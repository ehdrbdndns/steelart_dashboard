"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

type BlockingOverlayProps = {
  open: boolean;
  title: string;
  description?: string;
  className?: string;
};

export function BlockingOverlay({
  open,
  title,
  description,
  className,
}: BlockingOverlayProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      aria-busy="true"
      aria-live="polite"
      role="status"
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center bg-black/35 px-4",
        className,
      )}
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-xl border bg-background px-6 py-5 text-center shadow-xl">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
