# Dream Street · 街道与倒影

一个人一直向前走，玻璃里的他表达着自己。有人靠近，试着跟上几个舞步；到了路口，回头道一声再会。

当前版本是 **0.5.0 / G2.3 · 节拍与身体**。这一轮做了三件事：

- 修复"所有人物像僵尸一样举着手"的骨架问题，重做自然步行；
- 找回四连的专属编舞；
- 把背景改为按编排踩点、以 128 BPM 行进的原创配乐。Sea Power 的原曲只留作对照试听。

意图、实现与缺口的逐条对照见 [docs/INTENT.md](docs/INTENT.md)。每位接手的人都请先读它。

## 阶段位置

原始 H0001 方案共有 **G0、G1、G2、G3 四个节点**：

| 节点 | 当前状态 |
| --- | --- |
| G0 空间与双身 | 已实现：固定镜头、共享行程、单一倒影、玻璃裁切 |
| G1 核心记忆片段 | 已实现：四连的专属舞句已在 G2.3 找回，每记重音前衣服已换好 |
| G2 完整持续街道 | 功能齐备，正在做体验打磨。G2.1、G2.2、G2.3 都是迭代编号 |
| G3 可选单键表达 | 未实现、后置，原方案明确它不是 G2 的必要条件 |

画面、动作和音乐是否贴近梦境，只能由实际观看和试听决定。测试通过不等于体验已经成立。

## 运行

使用 Node 24.20.0 和 npm 11.19.0。依赖版本固定在 lockfile 中：Three.js 0.185.1、Vite 8.2.2、Playwright Test 1.63.0，以及仅用于开发的 Prettier 3.9.9。

```sh
npm ci
npm run dev
```

打开 `http://127.0.0.1:5173/`，点击「开始前行」。页面隐藏时会暂停，回来后点击「继续」。静音只改变音量。开发和预览服务都只监听 `127.0.0.1`。

```sh
npm test               # 单元测试
npm run test:browser   # 浏览器测试（本机 Chrome；需要能监听本地端口）
npm run build
npm run preview
npm run format:check
```

## 音乐

默认播放**原创配乐**。它和街道、衣装、舞蹈共用同一条拍号时间轴，四个章节就是街道的四个窗口：

| 拍号 | 章节 | 音乐 |
| --- | --- | --- |
| 0–80 | 电光 | 推进型 G 小调电子。第 48 拍前两小节做铺垫，第 50、52、54、56 拍是四记全乐队停顿重击（四连），第 58 拍全编制落下 |
| 80–144 | 同行 | 更重的碎拍律动。随着路人加入，群体拍手和跺脚逐渐变多；路人散去时变稀，但不停下 |
| 144–208 | 花间 | 降 E 大调的温柔段：电钢、暖垫、钟琴和柔和的心跳，没有重鼓 |
| 208–256 | 游乐 | 小型铜管乐队式的进行曲，配钟琴 |

每拍都有可听的节拍，主角每拍落一步。每个章节入口前都有一段在入口处落下的铺垫。混音链自身的处理延迟会在启动时实测（Chrome 中约 6 ms），音符提前这段时间发出，保证声音落在画面显示的那一拍上。

音乐面板里的「对照原曲」通过可见的官方 YouTube 播放器播放 Ecstatic Vibrations, Totally Transcendent，只用来比较力量感。对照时原创配乐静音但继续计时，画面仍按原创配乐的节拍走，两者**不对齐**，也无法录入视频。不下载、不提取这首录音。

## 评审工具

在地址后加 `?debug=1` 可以使用拍号跳转、接触线、分轨开关（drums / bass / harmony / lead / crowd / fx）和录制。

- **特写检查**：`?debug=1&inspect=walker|dancer|crowd|cyclist&index=N&zoom=3.6`。保持产品镜头的视角和投影，只拉近并对准一个角色，用来判断手臂和肘部。
- **同拍号截帧**：先开着开发服务器，再运行 `node scripts/review-frames.mjs --label <名字>`，特写与全景存到 `artifacts/review/<名字>/`，可以和上一轮逐张对照。
- **离线试听与指标**：`node scripts/render-music.mjs --label <名字>` 把各章节、四连段和循环接缝渲染成 WAV，存到 `artifacts/music/<名字>/`，并记录峰值、RMS、峰均比、低频占比，以及每记四连重击的对拍误差和响度分位。
- **录制与长跑**：`npm run capture` 录制带配乐音轨的一整轮，同时连续运行（默认 600 秒，可用 `DREAM_STREET_SOAK_SECONDS` 调整），报告写入 `artifacts/capture/`。`DREAM_STREET_MUSIC=silent` 用于离线动作检查。

媒体和报告都不纳入 Git。

## 代码结构

- `src/content/`：256 拍街段、商品与衣装状态、表演章节、路人和骑车人的路径与致意。
- `src/character/`：参数化母本、独立骨架与 IK（肘部按解剖方向弯曲）、步态、四连与各章节舞句、衣料折光。
- `src/audio/`：唯一时钟 `transport.js`、原创配乐 `score.js`、乐器 `instruments.js`、混音 `mixer.js`、离线渲染 `render.js`，以及仅作对照的 `reference.js`。
- `src/world/`：三个复用街道池、36 人实例绘制、两个预建自行车角色。
- `src/render/`：固定正交镜头、共享倒影纹理、玻璃透底染色与深度裁切，以及调试特写相机。

素材与参考见 [ASSETS.md](docs/ASSETS.md)，实测结果与边界见 [VERIFICATION.md](docs/VERIFICATION.md)。

## 分支与保护

`main` 是默认分支，改进在 `feature/*` 分支上迭代，经评审后通过 PR 由 Jovi 手工合入。

GitHub Free 的私有仓库不能设置远端分支保护，所以本机共享的 `.git/hooks/pre-push` 会拒绝删除 `main` 和对 `main` 的非快进推送。Hy 的每日快进推送不受影响。升级到 Pro 或公开仓库后，可以改用远端保护：

```sh
gh api -X PUT repos/L-Jovi/dream-street/branches/main/protection -F enforce_admins=true -F required_linear_history=true -F allow_force_pushes=false -F allow_deletions=false -F required_status_checks=null -F required_pull_request_reviews=null -F restrictions=null
```

格式化专用的提交记录在 `.git-blame-ignore-revs` 中，可执行 `git config blame.ignoreRevsFile .git-blame-ignore-revs`。
