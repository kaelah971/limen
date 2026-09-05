import * as actionsCore from "@actions/core";
import { formatActionError, runAction } from "./main";

void runAction().catch((error: unknown) => {
  const message = formatActionError(error);
  actionsCore.error(message);
  actionsCore.setFailed(message);
});
