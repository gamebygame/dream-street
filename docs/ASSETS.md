# 素材、依赖与来源

## 本项目生成的内容

角色身体、五套衣装、头部和帽子、鞋、街道、楼面、人台、树和玻璃均由本项目 JavaScript 几何代码生成。两名表演实例共用母本和几何缓存，各自求解姿势；使用刚性部件附着的骨架，不包含外部角色模型或动作包。

舞蹈为本项目编写的连续姿势曲线；行走采用支撑脚约束和双段腿部修正。四个重音是同一段准备、到位、保持、恢复的编舞。

音乐为本项目原创的 D Dorian / 120 BPM / 4/4 编排。底鼓、拍手、闭镲、木质手鼓音色、低音、和声、短旋律均由 Web Audio 的 PCM 合成代码生成，不含采样包、第三方歌曲或外部录音。系统字体、代码生成的店招和内嵌 SVG 图标不需要下载字体或贴图。

项目目前是私有原型，未为项目源码及这些原创内容指定对外开源许可证。第三方依赖的许可不会自动成为本项目的许可。

## 第三方依赖

| 依赖 | 固定版本 | 使用范围 | 许可 |
| --- | --- | --- | --- |
| Three.js | 0.185.1 | 浏览器运行时渲染、数学及几何合并辅助 | MIT |
| Vite | 8.2.2 | 开发和构建 | MIT |
| @playwright/test | 1.63.0 | 测试与演示录制 | Apache-2.0 |

完整传递依赖版本及许可标识位于 `package-lock.json`。构建工具链还包含 MPL-2.0、Apache-2.0、BSD-3-Clause、ISC 和 MIT 依赖；没有修改这些第三方包的源码。运行时依赖 Three.js 的完整 MIT 声明随 `public/THIRD_PARTY_NOTICES.txt` 进入构建输出。

## 输入计划的溯源

来自用户指定的 `H0001_gpt-web-to-codex` 目录，任务身份为 `dream-street / experience-reconstruction / H0001`。原包按 sealed 处理，只读取，不修改。此次实现依据用户在会话中明确批准的 G0 + G1 方案；办公楼入口提前至第 60 拍，第 64 拍回归旧装。

| 文件 | bytes | SHA-256 |
| --- | ---: | --- |
| HANDOFF.md | 15803 | `f697e870c67410574553c262b2954b5e8f343dc5a56cdc25553769ae090db974` |
| context/Dream Street Experience Record.md | 10944 | `1addd22b661fbc9f414b6287e79c8ac456924cedaeae6875f853d9597bea7ed1` |
| outputs/Dream Street Implementation Plan.md | 59602 | `c153d6ae827230d4e263b9567f74ddb36d23685aa7357af59280fe5e079f0388` |
| manifest.yaml | 913 | `f592d8508bbc697087ebcf9ed7211f824f3f3ec677b0c2f982caca09479b373c` |
| Dream Street Delivery Receipt.md | 2627 | `6da03dc4c46da2beb920a3ad95e823522657824ede9a2a0be4ae51ed38ea4e40` |

五件文件共 89,889 bytes，已逐一阅读。原四件文件与 manifest / 回执中的哈希一致。ZIP 未提供，未验证 ZIP 哈希。manifest 缺少来源、采集时间、截断及脱敏描述字段，因此只认定文件完整性核验通过，不宣称完整协议校验通过。未生成 H0002、未上传或晋升。
