# 桃花小院的声音

2026-09-24 从作者发布页选择免费素材，页面均明确标为 CC0。未使用商业游戏的提取音轨、第三方播放 SDK 或付费音乐接口。声音设置中保留原作名称、作者与来源链接；“花下慢坐”“小小心事”仅是本站显示名。

## 钢琴

- **Forget Me Not — Kistol**：[作者发布页](https://opengameart.org/content/forget-me-not)。采用作者提供的 `forget_me_not_in_f_major_looped.ogg` 循环版，约 124.1 秒。交付文件 `public/assets/audio/forget-me-not.mp3`，1,242,044 字节。原始文件 SHA256：`2b9b9fc512c34d52b999ed1fd7e01f960f830f3defc5d2241f6e02f8be81ef77`。
- **A Simple Trifle — jestar**：[作者发布页](https://opengameart.org/content/a-simple-trifle)。短钢琴主题，约 24.12 秒，作为偏童趣的备选。交付文件 `public/assets/audio/a-simple-trifle.mp3`，242,324 字节。原始文件 SHA256：`40353641ca8e968d63342c655bb3972a87382d2b808a07b550e849daa4a593bb`。

两首均使用完整所选版本，做响度调整（目标 -22 LUFS，true peak -5 dB）、转为单声道 32 kHz / 80 kbps MP3、移除嵌入元数据；浏览器对循环边缘做约 15 ms 淡化，开关和换曲使用短淡入淡出。原曲没有被说成本项目原创或专业治疗音乐。

## 交互音效

全部来自 [Kenney Interface Sounds 1.0](https://kenney.nl/assets/interface-sounds)，CC0。原包授权文字保存在 [licenses/kenney-interface-sounds.txt](licenses/kenney-interface-sounds.txt)，仅规范换行与空白。[CC0 说明](https://creativecommons.org/publicdomain/zero/1.0/)。

- `click_001.ogg` → `tap.wav`：按钮的短轻点。
- `scroll_001.ogg` → `paper.wav`：信纸、留言板与折纸声。
- `open_001.ogg` / `close_001.ogg` → `open.wav` / `close.wav`：开门与收起界面。
- `maximize_001.ogg` → `send.wav`：寄出信件。
- `confirmation_001.ogg` → `success.wav`：收到回信、留言贴好时的确认。
- `pluck_001.ogg` → `pet.wav`：抚摸时的轻拨音，按部位略微变化音高；这是界面音效，不是猫叫录音。
- `drop_002.ogg` → `feed.wav`：喂食的短落点声。

音效经高低通、响度调整与极短边缘淡化，转为单声道 22.05 kHz / 16-bit WAV，合计 98,914 字节。原始下载与完整素材包仅在被 Git 忽略的 `test-results/audio-source` 中，不打包发布。可运行 `python scripts/prepare-audio.py` 重新下载所选官方素材并用本机 ffmpeg 生成交付文件。

## 播放边界

右上角音符直接开关音乐，旁边“⋮”打开选曲、独立音量及音效开关。每次刷新音乐都关闭，音量、选曲和音效偏好存入 `huisheng-audio`；用户手动开启才请求 MP3。音效默认开启，在用户首次实际操作后才能播放；密钥、登录、免责声明等表单按钮不播放点击声，输入文字也不逐字发声。

所有音频按需从本站静态资源白名单加载，解码与混音在浏览器中完成。默认音乐压缩文件约 1.24 MB，32 kHz 单声道解码约 15.9 MB，服务器不进行实时音频计算。素材缓存一天；不将音乐加进首屏预加载。两首音乐可切换，只维持当前曲目及短暂淡出节点，没有播放器轮询或模型调用。

同种音效有最短间隔，摸猫为 1.8 秒，同时最多三个短音效；下载延迟超过 900 ms 的提示音会丢弃，避免延迟堆叠。切后台会停止短音效并挂起 AudioContext，返回时恢复；关闭音效也会取消等待加载的旧声音。音乐载入中再次点音符可取消，失败可重试，不影响其他功能。

## 验证

`node test/audio.mjs` 使用真实浏览器 Web Audio 解码素材，检查非静音数据、两首曲目的时长、手动开启与延迟加载、切换与停止、前后台挂起、独立音效开关、摸猫节流、回信提示、偏好保存且刷新不自动播、手机布局、取消加载与失败重试。聊天接口用合成响应，不调用付费模型。自动测试验证了播放与交互状态，不代替不同设备上的主观听感试听。
