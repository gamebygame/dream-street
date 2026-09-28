# 素材、依赖与来源

## 本项目生成的内容

角色身体、五套衣装、头部和帽子、鞋、街道、九类楼面、人台、树、玻璃、道具、自行车均由本项目 JavaScript 几何代码生成。G2.1 实际编排八种道具：唱片、怀表、手杖、花束、玫瑰、伞、木偶、饮品；保留围巾的生成能力。36 名路人与两个骑车人复用身体母本和几何缓存，各自求解姿势。没有外部角色模型、动作包或贴图。

舞蹈为本项目编写的连续姿势曲线；行走采用支撑脚约束和双段腿部修正。G2.1 参考用户提出的 MJ 舞蹈感受，借鉴抬帽、重心变化、脚尖脚跟、躯干分离和定势后的释放，重新编写完整舞句。参考入口为 [Michael Jackson 官方 Smooth Criminal 页面](https://www.michaeljackson.com/watch/smooth-criminal/)，没有提取或复制视频动作数据，不声称复现原版编舞。

道具表达参考 [Jacob’s Pillow 的 Stage Properties 专题](https://danceinteractive.jacobspillow.org/playlists/stage-properties/)：物品可以改变舞者的动作关系、空间与视线焦点。由此设计花束呈递与转腕、玫瑰的头部引导、伞的单手转向、怀表端详、手杖点地等原创短句。没有使用该站的图片、录音或视频作为项目素材。

G2.2 的身体语言参考 [皇家芭蕾舞学校 Port de Bras 课程说明](https://ondemand.royalballetschool.org.uk/product/focus-class-port-de-bras/) 关于姿态、重心、背部、呼吸与视线的协调，以及 [Shafir 等人的身体动作与情绪研究](https://pmc.ncbi.nlm.nih.gov/articles/PMC4707271/) 中动作时值、重量、下沉、收拢与头部姿态的区分。由此编写持续移重心、收拢、端详、缓慢打开和停留的原创动作；不是把研究关联当成每个人统一的情绪公式，也不声称是专业芭蕾复刻。没有购买课程或使用其中的付费内容。

G2.3 的背景音乐是本项目的**原创配乐**，全部用浏览器原生 Web Audio 实时合成，包括鼓组、贝斯、supersaw 与铜管式和弦刺击、FM 电钢、钟琴、群体拍手与跺脚；混响的冲激响应也由代码生成。和声进行与旋律均为原创，没有采样、音频文件或外部乐器库。离线渲染与指标脚本只把渲染结果写进 `artifacts/`，不进仓库。

用户提供的听感参照 **Ecstatic Vibrations, Totally Transcendent** 只作为「对照原曲」开关，通过可见的 [Sea Power 官方 YouTube 音源](https://www.youtube.com/watch?v=knOXppaqBYY) 和 [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference) 播放，用来比较力量感。它不驱动画面，不与画面对齐，也不进入录制。没有下载、提取这首录音，也没有把它放入仓库。官方 [Bandcamp 曲目页](https://seapower.bandcamp.com/track/ecstatic-vibrations-totally-transcendent) 提供正式音源信息；本项目没有购买该曲，也没有取得对外再分发的许可。原创配乐也没有复制这首曲子的旋律或编排。

G2.2 的 YouTube 驱动时钟、本机音频入口，以及 G1–G2.1 的烘焙式合成编曲，已在 G2.3 移除，可以在 Git 历史中查到。衣料光带和表面折光由代码生成，随倒影一起受玻璃裁切。

G2.3 的步行摆臂幅度参照 Clinics in Shoulder and Elbow 2023 年的论文 [The elbow is the load-bearing joint during arm swing](https://www.cisejournal.org/journal/view.php?doi=10.5397%2Fcise.2023.00101)：15 名健康成人以 1.11 m/s 行走时，肘部屈伸约 29.7°±10.2°，肩部屈伸约 56.4°±12.7°。本项目取肩部摆幅约 39°、肘部 15°–45°，这是造型取值，不是生物力学仿真。

系统字体、代码生成的店招和内嵌 SVG 图标不需要下载字体或贴图。旧衣人物按用户描述的落魄英伦绅士语汇制作，使用长大衣、高帽、领带与修补细节，没有使用电影剧照、演员肖像或现成角色资产。

项目目前是私有原型，未为项目源码及这些原创内容指定对外开源许可证。第三方依赖的许可不会自动成为本项目的许可。

## 第三方依赖

| 依赖 | 固定版本 | 使用范围 | 许可 |
| --- | --- | --- | --- |
| Three.js | 0.185.1 | 浏览器运行时渲染、数学及几何合并辅助 | MIT |
| Vite | 8.2.2 | 开发和构建 | MIT |
| @playwright/test | 1.63.0 | 测试与演示录制 | Apache-2.0 |
| Prettier | 3.9.9 | 源码格式化（仅开发依赖，不进入构建产物） | MIT |

完整传递依赖版本及许可标识位于 `package-lock.json`。构建工具链还包含 MPL-2.0、Apache-2.0、BSD-3-Clause、ISC 和 MIT 依赖；没有修改这些第三方包的源码。运行时依赖 Three.js 的完整 MIT 声明随 `public/THIRD_PARTY_NOTICES.txt` 进入构建输出。

## 输入计划的溯源

来自用户指定的 `H0001_gpt-web-to-codex` 目录，任务身份为 `dream-street / experience-reconstruction / H0001`。原包按 sealed 处理，只读取，不修改。G1 依据用户批准的核心片段方案；G2 依据原交接的完整体验及 2026-09-09 会话中的十一项优化意见；G2.1 依据后续关于舞蹈、实际音源、物品语义、人群互动、店面与自行车的七项意见。G2.2 依据用户关于直接使用指定原曲、自然摆臂、换装特效、抒情身体语言与骑车致意的反馈；按用户后续意见放宽原曲四连重音同步要求。继续保留办公楼入口第 60 拍、第 64 拍开始回归旧装；扩展为 256 拍首轮。

| 文件 | bytes | SHA-256 |
| --- | ---: | --- |
| HANDOFF.md | 15803 | `f697e870c67410574553c262b2954b5e8f343dc5a56cdc25553769ae090db974` |
| context/Dream Street Experience Record.md | 10944 | `1addd22b661fbc9f414b6287e79c8ac456924cedaeae6875f853d9597bea7ed1` |
| outputs/Dream Street Implementation Plan.md | 59602 | `c153d6ae827230d4e263b9567f74ddb36d23685aa7357af59280fe5e079f0388` |
| manifest.yaml | 913 | `f592d8508bbc697087ebcf9ed7211f824f3f3ec677b0c2f982caca09479b373c` |
| Dream Street Delivery Receipt.md | 2627 | `6da03dc4c46da2beb920a3ad95e823522657824ede9a2a0be4ae51ed38ea4e40` |

以上为 2026-09-08 输入核验记录：五件文件共 89,889 bytes，已逐一阅读。原四件文件与 manifest / 回执中的哈希一致。ZIP 未提供，未验证 ZIP 哈希。manifest 缺少来源、采集时间、截断及脱敏描述字段，因此只认定文件完整性核验通过，不宣称完整协议校验通过。H0002 是后续 G1 回传历史件；本轮直接在项目内迭代，未生成新的交接件。
