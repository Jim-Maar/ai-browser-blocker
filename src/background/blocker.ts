import { getStorage } from "../shared/storage";
import { RULE_ID_BASE, BLOCKED_PAGE_PATH } from "../shared/constants";

function getBlockedPageUrl(domain: string): string {
  return `${chrome.runtime.getURL(BLOCKED_PAGE_PATH)}?domain=${encodeURIComponent(domain)}`;
}

export async function syncAllRules(): Promise<void> {
  const [blockedDomains, unblocksOld] = await Promise.all([getStorage("blockedDomains"), getStorage("activeUnblocks")]);

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing.map((r) => r.id);

  const now = Date.now();
  const unblocksNew = new Set(
    unblocksOld.filter((u) => u.expiresAt === null || u.expiresAt > now).map((u) => u.domain),
  );

  const addRules = blockedDomains
    .filter((domain) => !unblocksNew.has(domain))
    .map((domain, index) => buildRule(domain, index));

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: removeIds,
    addRules,
  });
}

function buildRule(domain: string, index: number): chrome.declarativeNetRequest.Rule {
  return {
    id: RULE_ID_BASE + index,
    priority: 1,
    action: {
      type: "redirect" as chrome.declarativeNetRequest.RuleActionType,
      redirect: { url: getBlockedPageUrl(domain) },
    },
    condition: {
      urlFilter: `||${domain}`,
      resourceTypes: ["main_frame" as chrome.declarativeNetRequest.ResourceType],
    },
  };
}

/** Temporarily remove the block rule for this domain (during an active unblock session). */
export async function removeBlockRule(domain: string): Promise<void> {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const rule = existing.find((r) => {
    const url = (r.action.redirect as { url?: string } | undefined)?.url ?? "";
    return url.includes(encodeURIComponent(domain));
  });
  if (rule) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [rule.id],
    });
  }
}

/** Re-add the block rule for this domain (after an unblock session ends). */
export async function restoreBlockRule(domain: string): Promise<void> {
  const domains = await getStorage("blockedDomains");
  const index = domains.indexOf(domain);
  if (index === -1) return;
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [RULE_ID_BASE + index],
    addRules: [buildRule(domain, index)],
  });
}
