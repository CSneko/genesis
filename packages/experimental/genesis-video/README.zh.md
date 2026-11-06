---
description: "Genesis Remotion 持久工程、本地素材剪辑、沙箱渲染与重启恢复。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-genesis-video

[English](README.md) | 中文

## Summary

通过本地视频、定时字幕、音乐和自定义 React 场景创建作品，直接通过 Remotion Player 预览合成，再交付 PNG 预览或 MP4 成片。可选层提供需要学习、仅操作者可用的 Genesis 工具包。工程修订跨重启保留，中断渲染需要明确创建新任务。渲染沿用调用 Session 的文件权限和已经安装的 Chromium 浏览器。

## Table of Contents

[使用](#use) · [实现](#implementation) · [延伸阅读](#further-exploration) · [模型体验](#model-experience) · [已知限制与后续工作](#known-limitations-and-deferred-work)

-----

<a id="use"></a>
## 使用

源码工作区的 Genesis Web 默认组合包含此层。通过 `pnpm install` 安装 Remotion 依赖。明确运行 `pnpm --filter @deepseek-ai/dsh-experimental-genesis-video exec remotion browser ensure` 安装本地渲染浏览器，将命令打印的绝对可执行文件路径设为 `GENESIS_VIDEO_CHROMIUM`。工具不会安装依赖或浏览器。FFprobe 需要预先可用；`GENESIS_VIDEO_FFPROBE` 可以选择其他可信可执行文件。

通过受支持的启动器运行：

```sh
GENESIS_VIDEO_CHROMIUM=/absolute/path/to/chrome-headless-shell pnpm dsh web
```

普通 Harness profile 需要先应用 Genesis 基础与 Life 覆盖层，再应用本包的 `cordis.patch.yml`；保留部署已有的 Genesis 记忆与模型配置。视频覆盖层插入 `genesis-video`，将工程存入 `dshHomePath('video-projects')`，并读取上述两个环境选择项。使用 `--no-genesis` 且不应用此覆盖层时，普通 Harness 默认行为不变。

通过 `learn` 教会准确工具名 `genesis_video`，再在该对话中用 `genesis_toolkit` 启用“视频制作”工具包。工具包只安装一次，保留操作者后续编辑或删除。执行时只允许配置的操作者 Life 预设，绕过声明可见性也会检查。群聊发言者不能通过提供姓名或工程标识获取视频权限。编辑与渲染要求 Session 文件策略可写；部署只向已经学会此工具的操作者 Life Session 授予该私有工程目录。

调用 `action: "guide"` 查看操作输入与配置的环境限制。先创建空时间线工程，导入本地媒体，再引用返回的素材名保存修订。时间线支持视频／图片／纯色片段、源片裁切、音量、覆盖／完整适配、首尾淡化、定时标题／字幕和音轨。重叠图层配合淡化可以形成叠化。自定义源码导出默认 React 组件，可以导入 React／Remotion；使用 `staticFile` 引用已导入素材名。内置时间线的时间单位均为秒，按所选帧率取整。

通过 `preview` 传入工程／修订 ID，编译交互式 Remotion Player。不需要 MP4 渲染或无头浏览器。返回的 `previewPath` 是工程固定的 `preview.genesis-remotion.html`，将其作为 Markdown 文件链接返回，操作者即可打开 Genesis 侧边栏查看器。`snapshotPath` 保留该修订／任务的不可变预览。重建其他修订会更新固定文件；已打开的预览通过共享侧边栏重新载入控件刷新。查看器支持播放、拖动进度、音量与全屏，并提供“在浏览器中打开”和“下载预览文件”。隐藏侧边栏预览时暂停。查看器将场景代码放在不透明来源的隔离框架中，不提供主机回调，只允许内嵌 data／Blob 媒体；远程素材需要先导入再编译预览。

渲染模式为 `preview`、`final` 或 `still`；除非设置 `wait: true`，工具立即返回任务 ID。通过 `status` 查看有界近期进度和进程终态，或通过 `cancel` 停止并等待进程范围退出。活动渲染同时注册到既有 Harness 任务服务，可以通过其操作者任务控件停止。取消活动的所属轮次、对话释放、归档并停止、插件卸载和配置的截止时间也会停止所属渲染。进程完成只确立渲染成功，不代表画面或声音质量已经检查。通过 `status` 的 `deliver: true` 将核验完成的 PNG／MP4 作为附件交付到对话。

通过带明确分页的 `read` 和 `list` 继续现有工程。修订保留先前源码和时间线，不覆盖旧版本。`delete` 配合 `confirm: true` 删除一个无活动任务的工程、导入副本和本地输出；已交付附件与 Session 日志由各自的保留／删除机制管理。卸载插件会移除工具和授权，不删除工程。

-----

<a id="implementation"></a>
## 实现

<details>
<summary>产物、进程与权限归属</summary>

私有根目录通过带版本的回执绑定现有 Genesis 生命 ID。非空目录缺少归属、生命 ID 不符、记录不兼容或 JSON 不可读时会明确失败，不创建新生命或替代工程。第一版修订产物包含源码／时间线设置、父修订、创建时间及来源 Session／工具调用 ID。渲染准入与终态回执是分别带版本的文件。不修改 Session 格式或 Life Core 持久化格式。

每次渲染在新任务目录中展开一个修订，通过托管子进程提供者调用固定版本的 Remotion CLI。Session 沙箱包装准确 argv，操作不申请权限升级。Profile 必须提供本地文件系统、子进程、沙箱、任务与附件服务。React／Remotion 别名及 CLI 参数由部署拥有，模型源码不能提供 Node 配置。可执行自定义场景保留 Session 已有的文件／网络权限，不构成独立安全沙箱。

工程变更准入串行执行。工程、修订、素材、任务、输入／输出字节、Player 产物字节（`maxPreviewBytes`，默认 24 MiB）、时长、并行渲染数、渲染工作进程数和耗时均有明确配置限制。素材导入与输出核验最多缓冲配置的字节数。输出限制用于交付／核验，不是操作系统磁盘配额。发布结果不确定的写入失败会停止后续编辑／渲染，直至核实并重新加载。失败任务保留有界诊断，部分输出不能作为完成媒体交付。交付前重新检查文件长度与 SHA-256，再保存为附件。

重启只加载产物。已有准入、没有终态回执且没有所属进程的任务返回 `interrupted`；不会根据遗留输出文件变成 `completed`，也不会自动重启。明确再次渲染同一修订会创建独立任务。只读查看不执行已保存源码。源码、时间线和模型可见结果证据保存在正常工具调用／结果事件中；后台进度只有被明确查询为已记录的状态结果时才进入模型。

源码：[注册与预算](src/index.ts)、[产物／进程所有者](src/controller.ts)、[版本化解析](src/model.ts)、[时间线合成](src/composition.ts)、[模型操作指南](src/guide.ts)。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

[Genesis 工具包](../genesis/README.zh.md#toolkits) · [Genesis 子系统](../../../docs/subsystems/genesis.zh.md) · [应用 profile](../../../docs/architecture.zh.md#application-launch) · [Remotion 渲染](https://www.remotion.dev/docs/renderer) · [Remotion 授权](https://www.remotion.dev/docs/license)

<a id="model-experience"></a>
## 模型体验

### 已学工具与请求结果

#### What the model sees

经过正常学习和工具包启用后，注册的 `genesis_video` 声明进入模型。准确声明由 [index.ts](src/index.ts) 拥有，不在仅收录产品工具的工具目录范围内。`guide` 返回固定的[操作指南](src/guide.ts)和实际配置事实；其他结果包含所选产物 ID、源码片段、元数据、进程事实或附件引用。浏览器配置、学习、渲染成功与画面检查是不同事实。不添加视频专用系统提示词或辅助模型请求。

#### Token effect

声明在学习／启用后有条件加入上下文。每个结果受 `resultChars` 限制，源码读取受 `pageChars` 限制，列表受 `pageSize` 限制，进度受 `progressChars` 限制。渲染消耗本地 CPU／进程资源，不调用模型。视频画面和对白不会自动成为模型输入或已确立记忆。

#### KV Cache effect

工具调用／结果追加到 Session 历史。学习或启用工具包通过 Genesis 既有的已记录机制改变后续工具声明。工程编辑与后台渲染进度不替换已有提示词 token，新查询的状态结果追加各自观察。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 交互预览将源码和导入媒体嵌入有界的自包含文档。大型素材需要截短或缩小，以满足 `maxPreviewBytes` 与 Workspace Files 的完整文件读取限制（默认 32 MiB）。预览编译不保证浏览器编码格式支持或播放质量；此功能提供 Remotion Player，不包含完整 Studio 编辑器。
- 本地渲染要求明确安装 Chromium 与 FFprobe；不提供自动浏览器／依赖安装、云渲染、转写、声音生成、自动画面检查和发布。
- 定时文字使用已安装的系统字体。中文字幕需要合适的中日韩字体，字体存在性和渲染质量需要在部署主机上检查。
- 浏览器集成验证要求 `GENESIS_VIDEO_CHROMIUM`；普通产物／恢复测试不需要浏览器。模型驱动验证使用确定性模型适配器，不是真实模型提供商。
- 修订形成不可变的父子历史，可以分支；没有隐式当前修订或自动源码合并。原始素材不变，但可执行自定义源码可以修改 Session 策略允许的文件。
- 场景代码必须使用已安装依赖；浏览器／网络访问遵循部署已有控制。Remotion 授权取决于部署与组织，扩大分发前需要查看其当前条款。

### Dev Note

无。
