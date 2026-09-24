import { providers } from "./providers.mjs";

export class UpstreamError extends Error {
  constructor(status) {
    super("upstream");
    this.status = status;
  }
}

function claudeMessages(messages) {
  const out = [];
  for (const message of messages.filter((m) => m.role !== "system")) {
    const role = message.role === "tool" ? "user" : message.role;
    const content =
      message.role === "tool"
        ? [
            {
              type: "tool_result",
              tool_use_id: message.tool_call_id,
              content: message.content,
            },
          ]
        : [
            ...(message.content
              ? [{ type: "text", text: message.content }]
              : []),
            ...(message.tool_calls ?? []).map((call) => ({
              type: "tool_use",
              id: call.id,
              name: call.function.name,
              input: JSON.parse(call.function.arguments),
            })),
          ];
    // Parallel tool results must arrive in one user message.
    if (out.at(-1)?.role === role) out.at(-1).content.push(...content);
    else out.push({ role, content });
  }
  return out;
}

export async function completeChat({
  provider = "deepseek",
  model,
  apiKey,
  upstream,
  messages,
  tools = [],
  toolChoice = "none",
  tokens,
  signal,
  fetchImpl = fetch,
}) {
  const preset = providers.find((p) => p.id === provider);
  if (!preset) throw new UpstreamError(400);
  const headers = { "Content-Type": "application/json" };
  let body;
  if (provider === "claude") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
    body = {
      model,
      system: messages
        .filter((m) => m.role === "system")
        .map((m) => m.content)
        .join("\n"),
      messages: claudeMessages(messages),
      max_tokens: tokens,
      stream: false,
    };
    if (tools.length) {
      body.tools = tools.map(({ function: f }) => ({
        name: f.name,
        description: f.description,
        input_schema: f.parameters,
      }));
      body.tool_choice = { type: toolChoice };
    }
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
    body = { model, messages, stream: false };
    if (tools.length && !(provider === "glm" && toolChoice === "none")) {
      body.tools = tools;
      body.tool_choice = toolChoice;
    }
    if (provider === "openai") {
      body.max_completion_tokens = tokens;
      body.store = false;
    } else body.max_tokens = tokens;
    if (["deepseek", "kimi", "glm", "doubao"].includes(provider))
      body.thinking = { type: "disabled" };
    if (provider === "qwen") body.enable_thinking = false;
    if (provider === "gemini")
      body.reasoning_effort = /^gemini-2\.5-flash/.test(model) ? "none" : "low";
    // Kimi and newer reasoning families restrict temperature; use their defaults.
    if (provider === "deepseek") body.temperature = 0.7;
  }
  const response = await fetchImpl(upstream ?? preset.endpoint, {
    method: "POST",
    redirect: "error",
    signal,
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new UpstreamError(response.status);
  }
  const result = await response.json();
  if (provider !== "claude") return result.choices?.[0];
  const blocks = result.content ?? [];
  return {
    finish_reason:
      result.stop_reason === "max_tokens" ? "length" : result.stop_reason,
    message: {
      role: "assistant",
      content: blocks
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n"),
      tool_calls: blocks
        .filter((b) => b.type === "tool_use")
        .map((b) => ({
          id: b.id,
          type: "function",
          function: { name: b.name, arguments: JSON.stringify(b.input) },
        })),
    },
  };
}

export function modelError(error, personal) {
  if (!(error instanceof UpstreamError))
    return "连接超时或暂时无法到达模型服务，请稍后重试。";
  if (!personal && error.status === 402)
    return "共享 DeepSeek 余额不足。可以在 API 设置中使用自己的密钥，或等站主补充额度。";
  if (personal && [401, 403].includes(error.status))
    return "个人 API 密钥或访问权限未通过验证，请在 API 设置中检查账户、地域及模型权限。";
  if (personal && error.status === 402)
    return "你的模型账户余额不足，请到服务商控制台查看。";
  if (error.status === 429)
    return "模型服务暂时限流或账户额度受限，请到服务商控制台检查，稍后再试。";
  if (personal && [400, 404, 422].includes(error.status))
    return "模型 ID 或接口参数不受支持，请检查所选模型；可以先恢复预设模型再试。";
  return "这次没有收到完整回信，请稍后重试。";
}
