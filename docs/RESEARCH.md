# 资料与技能筛选记录

核查日期：2026-09-24。范围为官方实践指南、传统文献和开发工具检索；不是系统综述，未经过独立复核。遵照项目要求，由单个开发 Agent 完成，没有子 Agent 复核。

## 已纳入七张短卡的来源

- [NHS：Reframing unhelpful thoughts](https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/self-help-cbt-techniques/reframing-unhelpful-thoughts/)：核对网页实践步骤，用于事实与想法的区分。
- [NHS：Maintaining healthy relationships and mental wellbeing](https://www.nhs.uk/every-mind-matters/lifes-challenges/maintaining-healthy-relationships-and-mental-wellbeing/)：核对倾听、边界及处理冲突段落，用于关系交流卡。
- [NHS：Tackling your worries](https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/self-help-cbt-techniques/tackling-your-worries/)：核对 worry time、worry tree 与行动计划部分。
- [WHO：Doing What Matters in Times of Stress](https://www.who.int/publications/i/item/9789240003927)，2020，ISBN 9789240003927：核对官方书目简介和中文版本入口；当前只纳入简介级卡片，没有把未通读的指南全文冒充已入库内容。
- [WHO：Psychological first aid: Guide for field workers](https://www.who.int/publications/i/item/9789241548205)，2011，ISBN 9789241548205：核对官方简介，借鉴尊重尊严与实际支持的原则；不是把危机干预交给聊天机器人独立完成。
- [《三命通会》四库全书本](https://zh.wikisource.org/zh-hant/三命通會_(四庫全書本))：核对提要及卷次目录，保留提要对传本和部分论说的批评，只作传统文献入口。
- [《滴天髓》辑要](https://zh.wikisource.org/wiki/滴天髓)：核对通天论、天干论相关内容，用于自然意象和术语说明，不建立八字与人格、健康、关系结果之间的科学因果主张。

《子平真诠》也检索到古籍影印候选；尚未完成版本、可检索文字与数字文件使用条件的逐项核对，因此本版没有入库。现代“情感大师”课程、商业咨询逐字稿和来源不明的心理咨询 skill 没有直接导入。来源可追溯比人格包装更适合这个项目。

## 内容与授权处理

`knowledge/cards.json` 保存短篇原创中文概括及来源链接，没有下载、分发指南全文或现代注本。练习步骤由项目根据指南思路重新整理，明确不是机构的逐字原版或认证治疗方案。公开网页可访问不等于允许复制整套知识库；后续全文入库需要按具体版本确认。

维基文库页面标示历史作品为公有领域，同时页面附有署名与相同方式共享条款。本版不转载其整段校勘文字，保留来源和所读章节；今后若复制转录文本，需要保留相应来源、许可及版本信息。

这些指南并不证明本产品有效，古籍也不是心理支持的证据。资料库没有商业咨询资质，系统提示词与外部 skill 本身同样不是专业资质。

## 开发技能

通过 `skill-installer` 从 [Phaser 官方仓库 skills](https://github.com/phaserjs/phaser/tree/master/skills) 安装到开发者本机：

- [sprites-and-images](https://github.com/phaserjs/phaser/tree/master/skills/sprites-and-images)：静态图与动画精灵、层级、位置、着色等。
- [scale-and-responsive](https://github.com/phaserjs/phaser/tree/master/skills/scale-and-responsive)：固定场景尺寸、屏幕适配及输入坐标。
- [input-keyboard-mouse-touch](https://github.com/phaserjs/phaser/tree/master/skills/input-keyboard-mouse-touch)：鼠标、触摸、键盘及交互区域。

技能文件已安装并阅读相关部分；新会话可识别新安装的技能。这些是开发指导，不是运行时心理知识库，也不会随用户聊天发送给模型。当前交互使用普通 DOM、CSS 和浏览器 Canvas 做猫咪换色，还没引入 Phaser 运行时；以后真正做地图移动时再用引擎。

工具调用实现核对了 [DeepSeek 官方 Tool Calls 指南](https://api-docs.deepseek.com/guides/tool_calls/)。第一次允许模型选择工具，应用完成本地执行，第二次用 `tool_choice: none` 收束成回信；不照搬持续循环的 Agent 框架。
