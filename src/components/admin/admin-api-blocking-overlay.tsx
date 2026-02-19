"use client";

import { useEffect, useState } from "react";
import {
  getPendingAdminRequestCount,
  subscribeAdminRequestCount,
} from "@/lib/client/admin-request-tracker";

const OVERLAY_DELAY_MS = 300;

export function AdminApiBlockingOverlay() {
  const [pendingCount, setPendingCount] = useState(getPendingAdminRequestCount());
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    return subscribeAdminRequestCount(setPendingCount);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (pendingCount > 0) {
      timer = setTimeout(() => {
        setVisible(true);
      }, OVERLAY_DELAY_MS);
    } else {
      setVisible(false);
    }

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [pendingCount]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [visible]);

  if (!visible) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35">
      <div className="flex flex-col items-center gap-3 rounded-md border bg-background px-6 py-5 shadow-xl">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
        <p className="text-sm font-medium">요청 처리 중입니다...</p>
      </div>
    </div>
  );
}
