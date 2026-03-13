"use client";

import { useEffect, useState } from "react";
import { BlockingOverlay } from "@/components/ui/blocking-overlay";
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

  if (!visible) {
    return null;
  }

  return (
    <BlockingOverlay
      open={visible}
      title="요청 처리 중입니다..."
      description="관리자 데이터를 불러오고 있습니다."
    />
  );
}
