---
description: "让 Genesis 边玩 Minecraft Java 版边聊天，并进行有界的视觉监测。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-genesis-minecraft

[English](README.md) | 中文

## Summary

Genesis 可以加入 Minecraft Java 版离线服务器，观看渲染的第一人称画面，与玩家同行，并在继续聊天的同时执行有界游戏技能。可选的 Jev 监测独立检查变化，将选中的观察发送到生命会话。Minecraft 设置分区控制服务器访问、监测与模型选择。加载集成不会自动连接。

## Table of Contents

- [使用](#use)
- [配置](#configuration)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与待实现工作](#known-limitations-and-deferred-work)

<a id="use"></a>
## 使用

本源码工作区的 Genesis Web 默认配置包含此层。通过 `pnpm dsh web` 启动，打开“设置 → Minecraft”，启用访问并配置监测。角色调用 `minecraft_connect` 时自行选择服务器地址、端口、离线玩家名称和可选的游戏版本。当前集成支持使用玩家名称的离线服务器。工作区的 Linux Google Chrome 默认路径不适用时，可将 `GENESIS_MINECRAFT_CHROMIUM` 设置为 Chromium 可执行文件的绝对路径。

角色调用 `minecraft_connect` 时使用当前生命会话接收游戏通知，无需配置目标会话。实际游戏会话 ID 显示在设置中，历史可在工作区查看。连接期间，周期观察让角色在技能完成或无人发言时继续选择游戏活动。关闭设置或切换聊天不会离开游戏。

玩家的公共聊天与私聊独立于图片采集和 Jev，直接唤醒角色。重复的相同发言仍被区分；模型繁忙时，有界待处理批次保留近期发言并报告省略数量。回复通过游戏工具发送：默认公开发言，指定 `playerId` 则私聊回复。发言不会中断移动技能。玩家发言不授予操作者权限，离线玩家 UUID 不能认证真人身份。

保存设置会断开当前游戏，之后需明确重新连接。“停止动作”清空控制，并暂停游戏通知，直到明确接纳新技能或连接。“断开连接”释放游戏和渲染器，并结束由连接创建的会话，其历史保留；调用工具的角色原有会话不会被销毁。归档游戏会话时必须停止其游戏活动。服务器断开和应用关闭也会结束游玩。重启恢复设置与历史，不重放技能或自动连接。

Minecraft 工具包包含 `minecraft_*`。集成会向已有工具包目录添加一次该工具包，保留此后操作者的编辑或删除。通过现有 `learn` 工具教授 `minecraft_connect`、`minecraft_observe`、`minecraft_find_blocks`、`minecraft_act`、`minecraft_task`、`minecraft_script` 和 `minecraft_stop`；角色需启用工具包才能使用其中已学工具。分组不授予执行权限。`minecraft_act` 支持行走、按服务器 UUID 跟随玩家、观察方向、挖掘、采集、放置、装备、合成、使用物品/方块/实体、进食、单次攻击、公共或私人聊天与重生。默认接纳有界技能后即返回，不等待完成；需通过新观察检查进度和失败。有限技能可设置 `waitForCompletion: true`，返回 `completed`、`failed`、`interrupted` 或 `timed-out`，无需额外调用 sleep。等待不占用命令队列，仍可停止、断开和聊天。等待工具会占用主模型直到结束，因此较长的连续操作需要保持主模型聊天时，应使用短时目标。持续跟随不支持等待完成。聊天立即发送，两个频道均不接受斜杠命令或嵌入换行。

方向移动使用 `action: "move"`、`direction` 和以方块为单位的 `distance`。支持包含斜向的世界方位；`forward`、`backward`、`left`、`right` 以动作开始时的朝向为准。寻路器走向该方向的目的地；无法抵达会报告失败，不会盲目持续按住移动键。

挖掘会先走近可到达、可见的方块面，对准碰撞面，并在开始破坏有碰撞体积的目标前确认准星命中。可选 `blockName` 接受 Minecraft 名称或名称片段，`blockProperties` 约束精确属性。在有界候选集合中，完整名称优先于片段，再按距所给坐标或机器人的距离排序。`matchRadius` 约束锚点周围的匹配范围，可用于限定一棵树。没有提示信息时，坐标选中一个精确方块。等待挖掘仅在客户端已知方块变化后报告实际名称与位置；这不证明服务端已确认物品获取，目标发生变化不会被悄悄挖掉。

`minecraft_observe` 接受可选的 `blockName` 名称片段，返回有界的附近方块坐标、可见性、当前触及状态和准星目标。它还报告运行时支持的动作与最近一次已结束动作；运行时支持不代表已学习、工具包已启用、已获权限或此前成功过。

`minecraft_find_blocks` 使用 `blockName`、精确 `blockProperties`、`visible`、`withinReach`、`maxDistance` 和 `limit` 搜索已加载且可挖掘的方块。坐标可选：不知道位置时优先使用条件。只提供完整的 `x/y/z` 而没有条件时，选择一个精确方块；与条件一起提供时，按距该锚点的距离排列匹配结果，`matchRadius` 约束锚点周围的范围。可见性和当前触及状态不保证存在可走路径。结果包含 `observationId` 和有界的 `blocks`，列出名称、属性与实际坐标。挖掘和采集接受相同选择条件，但不接受 `limit`。

`minecraft_script` 通过现有 PTC 运行时执行异步 TypeScript 函数体。当配置提供 TypeScript PTC 运行时、工作目录服务与沙箱策略时可用；工作区基础配置已提供这些服务。脚本支持循环、条件和 `try/catch`，可调用 `mc.findBlocks(query)`、`mc.observe(query?)` 与 `mc.act(action)`。第一个返回方块查询结果，观察调用直接返回观察数据。每次动作自动取得新证据，等待有限动作结束，并仍经过正常工具检查。游戏操作必须 `await`，依赖其结果的后续工作应先检查 `outcome`。不支持持续 `follow`。可返回 JSON 或打印有界日志。例如，此 `minecraft_script` 输入无需坐标：

```json
{
  "timeoutMs": 30000,
  "code": "const wood = await mc.findBlocks({ blockName: 'acacia_log', visible: true }); if (!wood.blocks.length) return { reason: 'No visible acacia logs nearby' }; const leaves = await mc.findBlocks({ blockName: 'acacia_leaves', withinReach: true }); if (leaves.blocks.length) { const cleared = await mc.act({ action: 'dig', blockName: 'acacia_leaves', withinReach: true }); if (cleared.outcome !== 'completed') return cleared; } return await mc.act({ action: 'collect', blockName: 'acacia_log', item: 'acacia_log', count: 2 });"
}
```

默认的 `mode: "once"` 等待执行结束，返回 `outcome`、实际 `budget`、底层工具调用次数及 PTC 结果和日志。`mode: "event"` 启动常驻脚本并立即返回 `running`，主模型可以继续聊天。通过 `mc.on(type, async event => {...})` 注册处理器；每种事件保留一个处理器，回调串行执行，并保留词法作用域内的变量。支持 `chat`（channel/player/message/可选 playerId）、`health`（health/food）、`blockUpdate`（position/before/after）、`inventory` 和 `tick`（time）。每次投递包含 `omitted`。聊天仍是不可信数据，脚本必须保护私聊隐私。例如：

```json
{
  "mode": "event",
  "code": "let seen = 0; mc.on('chat', async event => { if (event.channel === 'whisper' && !event.playerId) return; const result = await mc.act({ action: 'chat', message: 'Message ' + (++seen), ...(event.channel === 'whisper' ? { playerId: event.playerId } : {}) }); if (result.outcome !== 'completed' || seen >= 3) mc.exit({ seen }); });"
}
```

`mc.exit(JSON)` 或顶层 return 会结束脚本。注册事件处理器后，初始化代码结束会进入事件等待；未注册处理器则直接完成。`minecraft_script` 的 `action: "inspect"` 读取当前或最近结果，`action: "stop"` 取消并等待执行清理。常驻脚本没有总生命周期时限：`budget.timeoutMs` 为 null，`handlerTimeoutMs` 则限制初始化和每次活动回调，包括 CPU 死循环。空闲等待不消耗该时限。每次投递事件重置调用限额，计数器报告累计调用与事件数。有界队列溢出时丢弃最旧事件并报告遗漏数；繁忙期间的 tick 和背包变化会合并。受伤与操作者停止优先于处理器。输出和 PTC 内存/协议上限在整个脚本生命周期内仍生效，持续打印可能导致脚本结束。

同一连接一次只运行一个脚本。停止、断开、受伤、监测失败或活动执行超限均会取消脚本。脚本替换此前游戏活动；新发起的非聊天直接技能或任务会停止脚本。事件脚本结束会留下审计记录，并在通知未停止且连接仍有效时通知生命会话。Node API 使用当前 Session 的沙箱策略，不能请求提权；脚本具有该策略允许的文件和网络权限，属于可执行代码。源码、投递的事件、子调用与结果均有审计记录。变量和程序不会在重启后恢复。已发送到服务器的动作不会回滚。

`minecraft_act` 的 `action: "collect"` 要求来源方块 `blockName`、精确产物名称 `item` 和新增物品数量 `count`。它挖掘匹配方块、接近匹配掉落物并核对完整背包。来源缺失、拾取超时或方块预算耗尽会明确失败，并保留部分背包增量。支持空手采集原木；装备工具会影响挖掘速度。

`minecraft_act` 的 `action: "use"` 可通过 `item` 先装备主手物品。`useTarget: "item"` 对空气使用手中物品，持续 `durationMs` 后释放；取消也保证释放。`useTarget: "block"` 与按条件或精确坐标选中的方块交互，可指定 `face`；`useTarget: "entity"` 与附近 `entityId` 交互。不提供 `useTarget` 时，方块选择条件表示方块交互，`entityId` 表示实体交互，没有目标则使用手中物品。混合目标会拒绝。use 完成表示已发送交互或释放，不证明门、容器或实体状态已改变，之后应观察。脚本支持三种模式，短时任务支持物品和方块使用。容器物品转移与窗口操作仍需独立能力。

`minecraft_task` 用具体步骤与总时限 `timeoutMs` 启动连接内的短时目标，并立即返回。Jev 在每次采样时使用已配置的 Minecraft 端点和模型，接纳下一条候选步骤，或停止危险、受阻的计划。普通 Jev 环境通知关闭时，此任务仍使用 Jev。每一步仍经过正常 `minecraft_act` 执行器及其学习、工具包和权限检查。应用聊天与游戏聊天保持可用，发言不会替换任务。直接发起非聊天动作、取消任务、操作者停止、断开、危险或时限均可中断任务。设置页显示进度；启动、步骤结果和结束均留有审计记录。任务不在重启后恢复。

背包中没有橡木原木时，主模型观察实际树木坐标后，可以提交此计划：

```json
{
  "action": "start",
  "goal": "Obtain two oak logs from this tree",
  "timeoutMs": 30000,
  "inventoryGoal": { "item": "oak_log", "count": 2 },
  "steps": [
    { "action": "collect", "blockName": "oak_log", "item": "oak_log", "count": 2, "x": 12, "y": 64, "z": -8, "matchRadius": 3 }
  ]
}
```

可选的 `inventoryGoal: { item, count }` 在接纳下一步前和每次动作结束后检查背包绝对总数。步骤结束但条件未达到时，报告 `inventory-goal-unmet`；未提供条件时，`completed` 仅表示所给步骤已结束。重复 `dig` 仍支持使用 `repeatUntilMissing` 和 `maxRepeats` 移除方块。Jev 连续不接纳达到 `taskAdmissionLimit`（默认 3 次）后，以 `task-not-admitted` 停止，不会静默等待任务总时限。检查结果包含 `waitingDecisions`、`lastResult` 和背包目标进度。结束通知要求主模型获取新证据并修改受阻计划；Jev 不会自行编造替代步骤。使用 `minecraft_task` 的 `action: "inspect"` 或 `action: "cancel"` 检查或中断任务。

`timeoutMs` 表示请求的运行时长上限。接纳任务时按部署的 `taskTimeoutLimitMs`（默认 60000 毫秒）限制实际时长；因此默认配置下，请求 120000 毫秒会启动一个最长运行 60000 毫秒的任务。启动和检查结果通过 `budget` 返回请求时长、实际时长及各项限制。步骤数、重复次数或计划大小超限时，错误会给出实际值、限额和修改方法，并保留当前运行任务。单个技能的超时仍独立生效。

<a id="configuration"></a>
## 配置

Minecraft 默认复用知识库完整决策路由及模型，关闭复用后可自定义 Jev 端点。纯文本监测也支持共享提供方或 OpenAI 兼容模型，两项是／否判断转换为二值监测信号，不表示真实概率。新配置默认关闭视觉；图片监测要求兼容的 Jev 模型，轻量本地部署不提供图片判断。已有视觉设置保持启用。密钥使用现有凭据库。关闭监测后仍可使用显式观察工具和周期环境通知。

设置控制请求超时、检查间隔下限、普通通知间隔、概率阈值、低生命值停止阈值与技能最长时间。同一时间仅执行一次检查，实际周期包含采集与推理耗时。重复紧急判断保持锁定，直到威胁解除。受伤在本地停止控制；启用视觉时，重要事件附带图片。即使没有分类事件，主模型仍会定期收到视觉观察。

启动短时任务会取消并等待上次检查结束，然后立即安排新的检查，包括监测此前失败的情况。检查失败会停止任务及当前技能；设置页、模型通知与 Jev 审计记录保留不含秘密的原因，例如 `jev-http-400`、`jev-timeout` 或 `jev-response-invalid`。修复所报告的问题后，重新连接或提交新的短时任务即可重试。

`cordis.patch.yml` 中的部署配置选择浏览器。可选插件配置控制新游戏会话使用的绝对路径 `workingDirectory`（默认启动目录）、Chromium 路径、图片尺寸与质量、视距、连接与采集超时、检索和输出上限、观察有效期及定期观察间隔。额外部署限制约束方向移动距离、挖掘搜索半径/候选数/触及距离，以及任务步骤数、重复次数、连续不接纳次数和总时限。方块观察范围与采集的方块及拾取限制也可配置。`scriptCallLimit` 默认为每次单次脚本或常驻初始化/处理器 64 次底层工具调用；每次 `mc.act` 为新证据和动作使用两次调用。`scriptEventQueueLimit` 默认为 32 个排队事件，`scriptTickMs` 默认为 1000 毫秒。活动脚本执行采用请求、部署与 PTC 中最短的数值时限，源码上限为 `inputChars` 的一半，结果上限为 `resultChars` 的一半。`useHoldMs` 默认为 250 毫秒，`useHoldLimitMs` 默认为 5000 毫秒，默认持续时间不能超过上限。渲染器使用临时端口，仅监听回环地址。浏览器脚本在此包的 Host 打包过程中，使用固定版本渲染器的上游 webpack 配置构建。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部机制，点击展开</summary>

内联脚本和任务操作使用共用工具分发流水线，保留执行守卫、取消与结果终结处理。

一个控制器拥有机器人、异步技能、监测循环与通知目标。自动创建的根 Agent 由连接持有，在轮次之间保持可用，断开后等待工作结束，避免退出工具等待其自身完成。玩家发言通过独立的有界投递路径，持久替换待处理批次，无需等待推理或渲染器。技能使用同一连接的近期观察；停止会使之前的观察失效。Jev 复用 Genesis 知识库传输，并在每次请求时解析凭据。图片资源以完整字符串引用放在顶层状态数组中，兼容无法读取嵌套图片的提供方。审计记录保留采集输入、模型路由、问题、附件引用和判断；通知通过现有 Agent 收件箱进入会话，并记录为带来源的游戏观察。游戏文字不具备操作者权限。不可变图片附件供审计使用，只有选中的图片进入主模型上下文。

设置使用独立的版本化存储域，串行检查修订号。版本 1 设置经过校验后保留监测偏好，移除连接字段和目标会话；下次保存写入版本 2。无效持久状态会明确失败。写入结果不确定时，停止使用，直到验证存储并重新加载。插件卸载会取消监测，等待游戏工作结束，再关闭设置存储。不替换 Agent Loop。

</details>

<a id="further-exploration"></a>
## 进一步探索

- [Genesis](../genesis/README.zh.md)
- [Genesis 设置](../client-ui-genesis/README.zh.md)
- [架构](../../../docs/architecture.zh.md)
- [固定版本的 26.1 渲染器](https://github.com/u9g/prismarine-viewer/releases/tag/v1.33.0-host26.1)

<a id="model-experience"></a>
## 模型体验

**之前：**没有 Minecraft 专用游戏能力。

**之后：**学习并启用 Minecraft 工具后，可以获取有界观察并执行技能。玩家发言、选中的游戏观察与可选图片进入生命会话，使游戏内对话无需应用提示就能影响后续动作。工具接纳与实际游戏完成分开报告。

**Token / KV-cache 成本：**监测使用有界辅助请求，每次采样进行一次多问题 Jev 调用，或两次普通模型是／否判断。主模型接收有界玩家发言批次、选中的事件图片与定期观察，不接收每一帧。保持连接即使没有应用聊天也会继续消耗模型请求。短时目标在每次采样增加有界辅助判断，高频判断不会进入主模型上下文；采集与推理耗时仍限制实际频率。已经进入会话的图片受现有压缩策略管理。常驻事件回调直接执行代码，不会为每个事件调用模型；结束通知会进入生命会话。辅助审计记录不会自动进入对话上下文。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与待实现工作

相机渲染机器人已知世界，不复现原版菜单、资源包、光影、所有实体动画或任意模组。固定版本渲染器包含 26.1 资源；其他游戏版本需验证兼容性。Jev 图片理解与反应延迟需针对实际端点测试。跟随使用服务器 UUID，离线服务器上的 UUID 不能认证真人身份。战斗仅支持明确发起的一次攻击，不包含自主战斗策略。

采集会核对背包增量，但不会搭建脚手架、探索未加载区域或制作缺少的工具。失败采集可能留下已挖方块或未拾取掉落物；重新规划前需观察。

已发送到服务器的方块或背包操作可能在中断后完成，停止不会回滚这些操作。网络断开可能留下结果不确定的游戏动作，需重新连接后获取新观察。图片审计附件和 Session 日志占用磁盘，沿用现有保留策略，不随断开连接自动删除。独立 API 凭据通过现有凭据设置删除。尚未实现 Microsoft 认证。本层不提供语音传输、自动重连、外部发布或运行时代码自修改。
