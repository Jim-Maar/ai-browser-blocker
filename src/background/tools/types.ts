export interface ToolCallArgs {
  duration_minutes?: number | null;
  reason?: string;
  field?: "blocked_domains" | "tracked_domains" | "rules_and_preferences";
  content?: string;
  message?: string;
}

export interface ToolExecutionContext {
  domain: string;
  tabId?: number;
}

export type ToolHandler = (args: ToolCallArgs, context: ToolExecutionContext) => Promise<string>;
