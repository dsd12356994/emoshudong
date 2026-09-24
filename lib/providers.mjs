import { InputError } from "./domain.mjs";

// Only these official endpoints can receive a personal key. Public metadata
// contains no credentials; arbitrary base URLs are deliberately unsupported.
export const providers = [
  {
    id: "deepseek",
    name: "DeepSeek",
    endpoint: "https://api.deepseek.com/chat/completions",
    models: ["deepseek-flash"],
    docs: "https://api-docs.deepseek.com/zh-cn/",
    console: "https://platform.deepseek.com/",
    note: "使用 DeepSeek 开放平台的 API Key。",
  },
  {
    id: "qwen",
    name: "通义千问 · Qwen",
    endpoint:
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    models: ["qwen-plus", "qwen-flash"],
    docs: "https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions",
    console: "https://bailian.console.aliyun.com/",
    note: "此预设使用中国内地（北京）接口，请使用对应地域的百炼密钥。",
  },
  {
    id: "kimi",
    name: "Kimi",
    endpoint: "https://api.moonshot.cn/v1/chat/completions",
    models: ["kimi-k2.6"],
    docs: "https://platform.kimi.com/docs/guide/kimi-k2-6-quickstart",
    console: "https://platform.kimi.com/",
    note: "使用 Kimi 开放平台密钥，默认关闭思考模式。",
  },
  {
    id: "glm",
    name: "智谱 · GLM",
    endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    models: ["glm-4.7-flash", "glm-4.7"],
    docs: "https://docs.bigmodel.cn/api-reference/模型-api/对话补全",
    console: "https://open.bigmodel.cn/",
    note: "使用智谱开放平台的通用 API Key，非专用 Coding 接口。",
  },
  {
    id: "doubao",
    name: "豆包 · Doubao",
    endpoint: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    models: ["doubao-seed-2-0-lite-260215"],
    docs: "https://docs.volcengine.com/docs/ark/chat-api?lang=zh",
    console: "https://console.volcengine.com/ark",
    note: "使用火山方舟北京地域密钥；也可填写已开通的 ep- 开头推理接入点 ID。",
  },
  {
    id: "openai",
    name: "OpenAI · GPT",
    endpoint: "https://api.openai.com/v1/chat/completions",
    models: ["gpt-4.1-mini", "gpt-4.1"],
    docs: "https://developers.openai.com/api/docs/models/gpt-4.1-mini",
    console: "https://platform.openai.com/api-keys",
    note: "使用 OpenAI API 账户；ChatGPT 订阅与 API 额度分开。需要服务器网络可达。",
  },
  {
    id: "gemini",
    name: "Google · Gemini",
    endpoint:
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    models: ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
    docs: "https://ai.google.dev/gemini-api/docs/openai",
    console: "https://aistudio.google.com/api-keys",
    note: "使用 Google AI Studio 密钥及 OpenAI 兼容接口。可用地域与服务器网络需支持。",
  },
  {
    id: "claude",
    name: "Anthropic · Claude",
    endpoint: "https://api.anthropic.com/v1/messages",
    models: ["claude-sonnet-4-5"],
    docs: "https://platform.claude.com/docs/en/api/messages/create",
    console: "https://platform.claude.com/",
    note: "使用 Anthropic API 密钥，通过原生 Messages 接口调用。需要服务器网络可达。",
  },
];

export function personalConnection(input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some(
      (k) => !["provider", "model", "apiKey", "consent"].includes(k),
    )
  )
    throw new InputError("个人 API 配置无效，请重新打开 API 设置。");
  const provider = providers.find((p) => p.id === input.provider);
  if (!provider) throw new InputError("请选择列表中的模型服务商。");
  if (input.consent !== true)
    throw new InputError("请先确认个人 API 的转发与计费说明。");
  if (
    typeof input.model !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,159}$/.test(input.model)
  )
    throw new InputError("请填写有效的模型 ID。");
  if (
    typeof input.apiKey !== "string" ||
    !/^[\x21-\x7e]{8,2048}$/.test(input.apiKey)
  )
    throw new InputError("请填写完整的 API Key，不能包含空格或换行。");
  return {
    provider: provider.id,
    model: input.model,
    apiKey: input.apiKey,
    upstream: provider.endpoint,
  };
}
