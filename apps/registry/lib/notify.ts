import { toast } from "sonner";
import { errorCode, messageOf } from "./format";

/** Show a registry error. A version conflict offers a Reload action when one is given. */
export function notifyError(error: unknown, reload?: () => void) {
  if (reload && errorCode(error) === "VERSION_CONFLICT") {
    toast.error(messageOf(error), { action: { label: "Reload", onClick: reload } });
    return;
  }
  toast.error(messageOf(error));
}
