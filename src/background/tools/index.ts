import { executeUnblock } from "./unblock";
import { executeBlock } from "./block";
import { executeEditSettings } from "./edit-settings";
import type { ToolCallArgs, ToolExecutionContext, ToolHandler } from "./types";

export { TOOLS } from "./definitions";
export type { ToolCallArgs, ToolExecutionContext } from "./types";

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  unblock_website: executeUnblock,
  block_website: executeBlock,
  edit_settings: executeEditSettings,
};

export async function executeTool(name: string, args: ToolCallArgs, context: ToolExecutionContext): Promise<string> {
  const handler = TOOL_HANDLERS[name];
  return handler ? handler(args, context) : "Unknown tool.";
}
