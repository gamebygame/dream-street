# Dream Street · 街道与倒影

[English](README.md) | 简体中文

> 对应英文版：2026-10-01。英文版更新后本页可能滞后；以英文版为准。

一条永远明亮的白昼街道，和在橱窗里起舞的自己。

## 背景

一个穿旧长大衣的人沿着阳光下的街道一直向前走，从不停下。他只是走路；橱窗里他的倒影却在跳舞，每当橱窗里的陈列碰到倒影，倒影就换上新衣。

他身边的街道是活的。一路上有人在逛橱窗、在路口等候、在聊天、在走路、在骑车。他走近时，这些人转过身跟上他的步子，试着学几个动作；到了下一个路口，他们挥手道别，各走各的路。

Dream Street 把一场梦重建成一个小小的浏览器体验。看到和听到的一切都由代码生成：街道、人群、舞蹈，以及为一支小型摇滚乐队写的原创配乐。主角每拍落一步，速度是 128 BPM。

## 试玩

- 在线：<https://gamebygame.github.io/dream-street/>。域名有效期内，<https://dream-street.jovipro.com/> 作为别名提供同一份构建。
- 本机：安装依赖、启动开发服务，打开 `http://127.0.0.1:5173/`，点击「开始前行」。

```sh
npm ci
npm run dev
```

页面隐藏时会暂停，回来后点击「继续」。静音只改变音量。开发和预览服务都只监听 `127.0.0.1`。

## 仓库边界

- **纳入版本控制：** 应用源码（`src/`）、测试（`tests/`）、评审与录制脚本（`scripts/`）、文档（`docs/`），构建、CI 和 Pages 配置，以及为 jovipro 地址提供服务的 Cloudflare Worker（`deploy/`）。
- **不纳入：** `artifacts/`（评审截图、配乐渲染、录像和报告）、`dist/`、`node_modules/` 和各类缓存。这些是证据和构建产物，可以重新生成。
- **永远不纳入：** 凭据、个人数据、本机绝对路径，以及没有再分发许可的第三方媒体。

## 真相边界

- 行为以代码为准。`src/content/plan.js` 里编排好的时间轴、`src/character/pose.js` 的编舞、`src/content/crowd.js` 的人群和 `src/audio/score.js` 的配乐都是创作决定，只能与维护者商定后修改。
- [docs/INTENT.md](docs/INTENT.md) 是意图台账：每条要求的原意、对应到代码的哪里、还有哪些缺口。改动作或音乐之前先读它。
- [docs/VERIFICATION.md](docs/VERIFICATION.md) 只记录每一轮实际运行过的检查。
- [docs/ASSETS.md](docs/ASSETS.md) 记录所有参考、依赖和许可证。

意图台账和验证记录是用中文保存的工作记录，因为这些决定就是用中文做出的。其余文档都是英文。

测试通过不等于梦境成立。画面、动作和音乐对不对，要靠实际观看和试听来判断。

## 验证

需要 Node 22.12 或更高版本（开发使用 Node 24.20.0 和 npm 11.19.0）。依赖版本固定在 `package-lock.json` 中。

```sh
npm run format:check
npm test               # 单元测试
npm run test:browser   # 在本机 Chrome 中运行浏览器测试；需要能监听本地端口
npm run build
npm run preview
```

评审工具（需先启动开发服务）：

- **调试视图：** `?debug=1` 提供拍号跳转、接触线、分轨开关和录制。
- **特写：** `?debug=1&inspect=walker|dancer|crowd|cyclist&index=N&zoom=3.6` 保持产品镜头的视角和投影，只拉近对准一个角色，用来判断手臂和肘部。
- **同拍号截帧：** `node scripts/review-frames.mjs --label <名字>` 把特写和全景存到 `artifacts/review/<名字>/`，便于逐轮并排对照。
- **配乐渲染：** `node scripts/render-music.mjs --label <名字>` 把各章节、四连段和循环接缝渲染成 WAV，存到 `artifacts/music/<名字>/`。它记录峰值、RMS、峰均比和低频占比，以及每记四连重击的对拍误差和响度分位。
- **分轨配平：** `node scripts/balance-music.mjs` 逐章节单独渲染每一个分轨。
- **录制与长跑：** `npm run capture` 录制带配乐音轨的一整轮，同时连续运行。默认运行 600 秒，可用 `DREAM_STREET_SOAK_SECONDS` 调整。报告写入 `artifacts/capture/`。`DREAM_STREET_MUSIC=silent` 用于无声的动作检查。

## 音乐

配乐与街道、衣装、舞蹈共用同一条拍号时间轴；它的四个章节就是街道的四个窗口。

| 拍号 | 章节 | 音乐 |
| --- | --- | --- |
| 0–80 | 电光 | 推进型 G 小调摇滚：吉他与贝斯齐奏同一段强力和弦 riff。第 50、52、54、56 拍是四连，全乐队停顿重击；第 60–72 拍经过写字楼时是钢琴间奏。 |
| 80–144 | 同行 | 汇集而来的人群自己的"跺、跺、拍"，底下是放克摇滚贝斯线，随加入的人数变强；所有人都跟上步子后，乐队整体落下，配双吉他和声。 |
| 144–208 | 花间 | 降 E 大调的钢琴抒情曲，配柔和心跳和小提琴般的吉他，没有重鼓。 |
| 208–256 | 游乐 | 降 B 大调、钢琴推动的华丽摇滚，配双吉他和声。 |

乐队按 1970 年代摇滚的方式干净地演奏：干爽的鼓组配模拟青铜镲片、有颗粒感但不过载的吉他、钢琴，同时发声的声部很少，没有合成器和铺底音色。每一拍都有可听的节拍，每个章节入口都由一段鼓的过门引入。启动时实测混音链自身的延迟（Chrome 中约 6 ms），音符提前这段时间发出，让声音落在画面显示的那一拍上。

音乐面板里的对照开关通过 YouTube 官方播放器，播放当初用来衡量力量感的 Sea Power 原曲。它让配乐静音，但配乐的时钟照走：画面继续跟随配乐，两者不对齐。对照内容永远不会被录制。

## 目录结构

| 路径 | 内容 |
| --- | --- |
| `src/content/` | 256 拍街段、商品与衣装状态、表演章节，以及路人和骑车人的街头生活与路径 |
| `src/character/` | 身体母本、骨架与 IK（肘部按解剖方向弯曲）、步态、各段舞句和衣料折光 |
| `src/audio/` | 唯一时钟（`transport.js`）、配乐（`score.js`）、乐器（`instruments.js`）、加载时渲染的吉他和弦与镲片（`tones.js`）、混音（`mixer.js`）、离线渲染（`render.js`），以及仅作对照的原曲播放器（`reference.js`） |
| `src/world/` | 三段循环复用的街道、36 名实例化路人和两辆自行车 |
| `src/render/` | 固定正交镜头、共享倒影纹理、玻璃染色与裁切，以及调试特写相机 |
| `docs/` | 意图台账、验证记录，以及素材与许可证 |
| `deploy/` | 在 dream-street.jovipro.com 提供这份构建的 Cloudflare Worker，以及它的配置方式 |

## 部署与回滚

每次推送到 `main` 都会构建网站，并发布到 GitHub Pages 的 <https://gamebygame.github.io/dream-street/>（`.github/workflows/pages.yml`）。<https://dream-street.jovipro.com/> 通过一个小型 Cloudflare Worker 提供同样的文件，原因和配置见 [deploy/README.md](deploy/README.md)。PR 会运行格式检查、单元测试和构建（`.github/workflows/ci.yml`）。回滚时，在 `main` 上 revert 那次提交，工作流会重新发布之前的状态，两个地址同时跟上；也可以在更早的提交上重新运行 Pages 工作流。

## 版本发布

版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)，每个版本的变化记录在 [CHANGELOG.md](CHANGELOG.md)。推送标签 `vX.Y.Z` 会运行 `.github/workflows/release.yml`：它构建该标签的代码，并发布对应的 GitHub Release，附带：

- 构建好的站点 `dream-street-X.Y.Z-site.zip` 和 `.tar.gz`，都附有许可证（任何静态文件服务器都能直接托管，路径不限）；
- 两个压缩包的 `SHA256SUMS`；
- 签名的构建溯源证明，可用 `gh attestation verify <压缩包> -R gamebygame/dream-street` 校验。

## 维护者

项目由 Jovi（[@L-Jovi](https://github.com/L-Jovi)）维护。改动在分支上开发，经评审的 PR 合入 `main`；`main` 受保护，不能强推或删除。另见 [CONTRIBUTING.md](CONTRIBUTING.md)、[SECURITY.md](SECURITY.md)、[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) 和 [CHANGELOG.md](CHANGELOG.md)。

只做格式化的提交记录在 `.git-blame-ignore-revs` 中，可执行 `git config blame.ignoreRevsFile .git-blame-ignore-revs`。

## 许可证

代码以 [MIT License](LICENSE) 发布，文档以 [CC BY 4.0](LICENSES/CC-BY-4.0.txt) 发布。[`REUSE.toml`](REUSE.toml) 记录每个文件适用哪一种；第三方依赖及其许可证见 [docs/ASSETS.md](docs/ASSETS.md)。
