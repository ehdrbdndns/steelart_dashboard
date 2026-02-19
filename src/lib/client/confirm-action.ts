const DEFAULT_CONFIRM_MESSAGE = "이 작업을 진행하시겠습니까?";

export function confirmAction(message = DEFAULT_CONFIRM_MESSAGE): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  return window.confirm(message);
}
