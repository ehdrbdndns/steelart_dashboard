type PendingCountListener = (count: number) => void;

const listeners = new Set<PendingCountListener>();
let pendingRequestCount = 0;

function emitPendingCount() {
  listeners.forEach((listener) => {
    listener(pendingRequestCount);
  });
}

export function beginAdminRequest() {
  pendingRequestCount += 1;
  emitPendingCount();
}

export function endAdminRequest() {
  pendingRequestCount = Math.max(0, pendingRequestCount - 1);
  emitPendingCount();
}

export function getPendingAdminRequestCount() {
  return pendingRequestCount;
}

export function subscribeAdminRequestCount(listener: PendingCountListener) {
  listeners.add(listener);
  listener(pendingRequestCount);

  return () => {
    listeners.delete(listener);
  };
}
