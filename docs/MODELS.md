# 共享额度与个人 API

入院顺序是登录/游客选择 → 隐私与玩法公告 → 额度说明 → 首次毛色选择。额度说明不会自动消失，关闭、Escape 或“知道啦”均可继续，不构成聊天或密钥转发同意。小院与信纸里的 API 设置入口一直可用。

“100 元”是站主提供的初始共享 DeepSeek 额度说明，大家一起使用。本站不查询实时人民币余额，也不把每次调用折算为人民币。共享调用另有持久化每日次数上限，调用失败也计次。额度不足时明确报错，后续充值时间由站主自行决定。这里没有付费墙、充值或收款功能，养猫与逛小院不需要模型 API。

## 连接与隐私

- 默认使用服务端环境中的共享 DeepSeek 密钥，绝不返回浏览器。可用 `SHARED_ACCESS_ENABLED=false` 暂停共享服务。
- 访客自行填写的密钥只存在当前页面内存，刷新、关页或主动清除后失效；关闭设置窗口保留已应用的连接，但清空表单中的密钥。未保存的修改会丢弃。
- 使用自有密钥需要主动确认转发及计费说明。保存只更新页面状态；只有点击“测试连接”或寄信才将密钥交给本站服务器。服务器在请求内存中将其转发到所选服务商的固定 HTTPS 接口，不保存、不记录、不回显密钥。
- 前端个人配置要求安全上下文。公网部署仍必须配置 HTTPS、可信代理及相应网络与地域访问条件。浏览器插件、代理与服务商自身记录不在本站控制范围内。
- 个人连接失败不会自动改用共享密钥，也不会静默切换服务商。服务商、模型或密钥变化会使本页聊天同意失效；用户再次确认后才能发送，最近对话会跟随下一封信发送给新的服务商。已有草稿和聊天保留。
- 测试连接只发送一条固定的 `Reply with OK.`，输出上限 32 token，不携带聊天、生日或工具；可能计费。测试成功只证明收到文本响应，不等于已验证工具能力。
- 固定服务商白名单，不接受用户提交的 URL；HTTP 重定向被禁止，避免向其他地址转发凭证。模型 ID 可编辑，须选择支持工具调用的文本聊天模型。

## 官方接口预设

以下为 2026-09-24 核对的官方文档及本项目默认值，不代表永久可用或价格承诺。完整 endpoint 与可选预设在 `lib/providers.mjs`，无需安装任何模型 SDK。

- **DeepSeek**：默认 `deepseek-flash`，Chat Completions，关闭思考模式。[官方快速开始](https://api-docs.deepseek.com/zh-cn/)。
- **通义千问**：默认 `qwen-plus`，中国内地北京的 DashScope OpenAI 兼容接口，`enable_thinking: false`。请使用对应地域密钥。[接口文档](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions)。
- **Kimi**：默认 `kimi-k2.6`，Moonshot 中国区 Chat Completions，关闭思考模式，保留服务商温度默认值。[Kimi K2.6 指南](https://platform.kimi.com/docs/guide/kimi-k2-6-quickstart)。
- **智谱 GLM**：默认 `glm-4.7-flash`，通用开放平台 v4 Chat Completions，关闭思考模式。[对话补全文档](https://docs.bigmodel.cn/api-reference/模型-api/对话补全)。
- **豆包**：默认 `doubao-seed-2-0-lite-260215`，火山方舟北京地域 v3 Chat Completions，关闭思考模式，也可填写已开通的推理接入点 ID。[Chat API](https://docs.volcengine.com/docs/ark/chat-api?lang=zh)、[模型列表](https://docs.volcengine.com/docs/ark/model-list?lang=zh)。
- **OpenAI GPT**：默认 `gpt-4.1-mini`，Chat Completions，使用 `max_completion_tokens` 与 `store: false`，不发送其他厂商的 thinking 参数。此字段不等于承诺服务商零留存。[模型说明](https://developers.openai.com/api/docs/models/gpt-4.1-mini)、[接口文档](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)。
- **Google Gemini**：默认 `gemini-2.5-flash`，官方 OpenAI 兼容接口；2.5 Flash 系列使用 `reasoning_effort: none`，其他自填型号为 `low`，最终以具体型号支持情况为准。[兼容接口文档](https://ai.google.dev/gemini-api/docs/openai)。
- **Anthropic Claude**：默认 `claude-sonnet-4-5`，原生 Messages API，使用 `x-api-key` 与 `anthropic-version: 2023-06-01`，转换 system、tool_use 与 tool_result 消息。[Messages API](https://platform.claude.com/docs/en/api/messages/create)、[消息使用指南](https://platform.claude.com/docs/en/build-with-claude/working-with-messages)。

## 调用边界与验证

保留原有两阶段 Agent：第一次可选择一批最多三个只读工具，第二次收束回信；不会增加循环、子 Agent 或付费评估调用。GLM 的收束请求省略 tools 和 tool_choice，其余适用接口指定 none。任何服务商第二次仍返回工具调用，都会拒绝继续调用。没有增加数据库、向量服务或本地大模型。

个人 API 不占站主每日次数，单连接来源每分钟最多 20 次（含连接测试，内存计数，重启清空）；共享与个人合计最多三条并发、同一来源一条。聊天请求最多等待 90 秒，连接测试 25 秒；用户取消等待不保证撤回已经计费的服务商请求。来源使用实际连接地址，不信任转发头。

`npm test` 的模拟服务验证八种请求格式、两阶段工具结果、白名单与参数校验、个人与共享额度独立、错误不泄露、失败不回退、密钥及文本不落盘。`node test/model-settings.mjs` 用独立临时服务覆盖八种表单预设、真实前后端连接流程、同意与草稿保留、刷新清除、桌面与手机布局。所有新测试使用合成密钥和模拟响应，没有发送真实付费请求；尚未逐家真实验证账户、网络、模型访问或回信质量。
