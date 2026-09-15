import { getSystemSetting } from "@/app/actions/systemSettings";
import {
  DEFAULT_LINE_CONVERSATION_CONFIG,
  DEFAULT_LINE_QUICK_REPLY_CONFIG,
  createDefaultLineQuickButtons,
  createDefaultLineTriggerConfigs,
  LINE_CONVERSATION_CONFIG_KEY,
  LINE_QUICK_BUTTONS_KEY,
  LINE_QUICK_REPLY_CONFIG_KEY,
  LINE_TRIGGER_CONFIG_KEY,
  parseLineConversationConfig,
  parseLineQuickButtons,
  parseLineQuickReplyConfig,
  parseLineTriggerConfigs,
  type LineAutomationConfig,
} from "@/lib/lineAutomationConfig";

export async function getLineAutomationConfig(): Promise<LineAutomationConfig> {
  const [
    savedTriggers,
    savedQuickButtons,
    savedConversation,
    savedQuickReply,
    orderKeyword,
    quotationKeyword,
    pointsKeyword,
    stockKeyword,
    promoKeyword,
    linkKeyword,
    installationKeyword,
    loginUrl,
    stockJson,
    promoJson,
    orderJson,
    pointsJson,
    linkJson,
  ] = await Promise.all([
    getSystemSetting(LINE_TRIGGER_CONFIG_KEY),
    getSystemSetting(LINE_QUICK_BUTTONS_KEY),
    getSystemSetting(LINE_CONVERSATION_CONFIG_KEY),
    getSystemSetting(LINE_QUICK_REPLY_CONFIG_KEY),
    getSystemSetting("line_keyword_order"),
    getSystemSetting("line_keyword_quotation"),
    getSystemSetting("line_keyword_points"),
    getSystemSetting("line_keyword_stock"),
    getSystemSetting("line_keyword_promo"),
    getSystemSetting("line_keyword_link"),
    getSystemSetting("line_keyword_installation"),
    getSystemSetting("line_login_url"),
    getSystemSetting("line_flex_json_stock"),
    getSystemSetting("line_flex_json_promo"),
    getSystemSetting("line_flex_json_order"),
    getSystemSetting("line_flex_json_points"),
    getSystemSetting("line_flex_json_link"),
  ]);

  const triggers = parseLineTriggerConfigs(savedTriggers) ?? createDefaultLineTriggerConfigs({
    orderKeyword: orderKeyword || quotationKeyword || "",
    pointsKeyword: pointsKeyword || "",
    stockKeyword: stockKeyword || "",
    promoKeyword: promoKeyword || "",
    linkKeyword: linkKeyword || "",
    installationKeyword: installationKeyword || "",
    orderJson: orderJson || "",
    pointsJson: pointsJson || "",
    stockJson: stockJson || "",
    promoJson: promoJson || "",
    linkJson: linkJson || "",
  });

  return {
    triggers,
    quickButtons: parseLineQuickButtons(savedQuickButtons) ?? createDefaultLineQuickButtons(triggers),
    loginUrl: (loginUrl || "").trim(),
    conversation: parseLineConversationConfig(savedConversation) ?? DEFAULT_LINE_CONVERSATION_CONFIG,
    quickReply: parseLineQuickReplyConfig(savedQuickReply) ?? DEFAULT_LINE_QUICK_REPLY_CONFIG,
  };
}
