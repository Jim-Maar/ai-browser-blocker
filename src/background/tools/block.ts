import { getStorage, setStorage, appendHistory } from "../../shared/storage";
import { restoreBlockRule } from "../blocker";
import { cancelReblock, notifyTabsOnDomain } from "../timers";
import type { ToolCallArgs, ToolExecutionContext } from "./types";

export async function executeBlock(args: ToolCallArgs, context: ToolExecutionContext): Promise<string> {
  const targetDomain = context.domain;
  const reason = args.reason ?? "";

  const activeUnblocks = await getStorage("activeUnblocks");
  await setStorage(
    "activeUnblocks",
    activeUnblocks.filter((u) => u.domain !== targetDomain),
  );
  await cancelReblock(targetDomain);
  await restoreBlockRule(targetDomain);
  await appendHistory({ timestamp: Date.now(), type: "tool_block", domain: targetDomain, reason });
  await notifyTabsOnDomain(targetDomain, { type: "REBLOCK" });

  return `Blocked ${targetDomain}.`;
}
