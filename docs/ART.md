# 视觉素材记录

## 风格与构图

以用户提供的农场游戏截图作为视角与氛围参考，生成原创场景，未从参考图截取可用游戏资产。自然绿色草地、棕色木屋与陶瓦屋顶；右侧巨大的粉色桃树包围一处带木质洞壁、暗色纵深和微弱暖光的自然树洞。石子路连接小屋和树洞，小菜园与溪流只作装饰。

画面是像素插画风格的整体背景，不是已经拆好的像素瓦片或可行走地图。前端书信界面用米色纸张、旧玫瑰色按钮、细框、邮戳和中文楷体形成对应。字体来自本机系统，没有远程字体请求。

## 生成与交付

- 使用内置 `imagegen` 工具：先生成场景与透明背景小猫，再按用户补充的俯视参考修改场景。
- 场景最终提示重点：original cozy 16-bit farming-game courtyard, high oblique overhead, no sky/horizon, natural green grass, brown timber cottage left, large peach tree right with visible glowing hollow, pink blossoms rather than a whole-scene pink tint, no text/UI/watermarks or copied game assets。
- 小猫提示重点：透明背景、奶油色、小型像素精灵、清晰深色描边、可辨识的耳朵尾巴与眼睛，用作鼠标与换色预览。
- `scripts/prepare-art.mjs` 仅做交付压缩：场景保留生成尺寸，编码为 WebP；小猫压到 192 像素。原始生成文件留在本机生成目录，不包含在公开仓库中。
- `public/assets/garden.webp` 为使用中的场景；`public/assets/cat.webp` 为猫咪基础纹理。运行时由小画布对浅色毛发着色；原图不被改写。

花瓣是少量 CSS 粒子，不需要每帧向服务器请求。用户可以关闭，系统减少动态效果设置也会关闭动画。点击树洞、按钮焦点与移动端信纸均用语义 HTML 实现。

## 跑动与树洞交互更新

用户进一步要求猫咪能跑动、拖动，并直接进入树干中间的洞。使用内置 `imagegen` 分别编辑原场景和生成透明动画图集，再进行 WebP 交付压缩。

- 最终场景：`public/assets/garden.webp`。提示重点：只修改右侧树干，保留构图、木屋、桃花与草地；洞口位于树干中间，具有厚树皮边缘、木纹洞壁、暗色纵深与少量暖光，不绘制界面文字。前端文字与点击区叠在洞腔内。
- 最终动画图集：`public/assets/cat-run.webp`，512 × 256，4 列 × 2 行。提示重点：以原奶油小猫为形象参考，真实透明背景、相同体型和基线、朝右；前六格为六个不同跑步姿势，第七格站立，第八格被轻轻提起、爪子垂下。没有格线、编号或背景。
- 色彩预览基础纹理继续使用 `public/assets/cat.webp`。原始生成文件保存在开发者本机的生成目录，公开仓库只保留压缩后的交付素材。
- 80 像素角色画布按图集切帧、左右翻转与毛色选择绘制；有惯性跟随、指针捕获拖动、触摸取消和键盘移动。停止移动后不持续执行渲染帧。
- 树洞保留原生按钮语义，可点击、触摸或按 Enter 进入；拖动小猫至洞内松手也可打开信纸。

## 纸条折飞机

这次新增的是代码生成的简单纸面图形，不新增位图素材。纸条文字淡出后，四片同尺寸纸面沿折线收拢成飞机；动画根据当前提示卡与树洞的实际屏幕位置计算弧线、朝向及末段缩小。动画在浏览器完成，不向服务器发送请求。视觉阶段为可见阅读五秒、约一秒折叠、约两秒飞行，随后露出完整小院。

## 小猫暖暖屋

采用内置 imagegen 工具生成两张原创位图，用 `scripts/prepare-room.mjs` 通过浏览器 Canvas 仅做尺寸与 WebP 交付编码。原始生成图留在本机生成目录，不提交。最终素材：

- `public/assets/room.webp`：1536 × 1024，350656 字节，木色房间、桃花窗景和中央空地毯。
- `public/assets/cat-rest.webp`：512 × 512，169172 字节，2 × 2 透明表情图集，依次为平静、开心、想抱抱、困倦。
- `public/assets/glove.svg`：代码绘制的小型白手套鼠标图标，非生成位图。留言木板、食盆、猫粮袋和状态栏同样用 HTML/CSS 绘制。

房间最终生成提示词（内置工具，未使用 CLI/API 回退）：

> Use case: stylized-concept. Asset type: background illustration for an interactive cozy pixel-art cat room, landscape 1536x1024. Create an original highly polished cozy farming-game cabin interior, warm natural honey oak wooden walls and floor, soft pink peach blossom atmosphere, top-down 3/4 video game perspective, crisp visible pixel art with crafted little details. Sunlight through a large wood window on the back wall shows pink peach blossoms outside, pale pink gingham curtains, small bookshelves, potted plants, a tiny tea table at the left perimeter, comfy blankets and cushions around the edges. Composition: center floor is spacious and uncluttered with one large oval dusty rose braided rug centered around x50%, y65%, for a separately rendered interactive lying cat. No cat or other animals anywhere in the image. Leave central rug empty. Small bowl and food will be separate interactive HTML elements so do not draw bowls or food. Warm cream and dusty pink highlights, rich dark brown pixel outlines, natural wood remains brown, magical safe welcoming atmosphere. Fill the entire wide image with the room, no cutaway void, no text, no letters, no interface or labels, no watermark. Decorative details concentrated around edges, readable spacious central floor.

小猫表情最终生成提示词（内置工具，未使用 CLI/API 回退）：

> Use case: stylized-concept. Asset type: transparent 2 by 2 sprite atlas for an original cozy pixel-art virtual cat game. Square image, exactly four equal square cells with no gutters, no gridlines, no text, no shadows outside sprites. The same adorable cream white kitten with peach ears and visible dark cocoa outlines in each cell, soft chunky crisp pixel illustration. Every cell shows full cat in IDENTICAL RESTING LYING position and identical size/location: head at left-front at cell x30% y51%, plump body extends toward right at x60% y58%, front paws near x28% y72%, curled tail at far right x82% y60%. Cat occupies inner80% cell width, centered, with generous transparent margin. All four cells change FACIAL EXPRESSION ONLY: top left normal gentle relaxed awake eyes, top right delighted smiling crescent eyes and tiny smiling mouth, bottom left endearing slightly droopy sad kitten eyes (gentle wanting a cuddle, NOT crying or suffering), bottom right closed eyes sleepy peaceful dozing. No accessories, no hearts, no floating symbols, no environmental items, no ground plane, no background color. Genuine alpha transparent background for all cells. Cream white fur should be nearly grayscale warm cream to permit runtime recoloring. Keep matching body silhouette exactly in four frames.
