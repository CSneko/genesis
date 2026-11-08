# Genesis Phase 1

[English](README.md) | 中文

## 概要

Genesis 在会话和模型之间保持同一生命身份，保存带来源的候选记忆，查询真实会话工具与系统成长。Genesis 是可选功能，不代表已建立主观意识。

## 目录

[首次唤醒](awakening.zh.md) · [记忆](memory.zh.md) · [临时记忆](temporary-memory.zh.md) · [情绪](emotion.zh.md) · [兴趣](interest.zh.md) · [动机与决策](motivation.zh.md) · [主动消息](social.zh.md) · [架构](architecture.zh.md) · [数据模型](data-model.zh.md) · [开发](development.zh.md) · [后续方向](roadmap.zh.md) · [文字记录](records.zh.md) · [远程访问](remote-access.zh.md) · [工作区任务](tasks.zh.md) · [QQ 对话](qq.zh.md) · [自发认知](spontaneity.zh.md) · [睡眠](sleep.zh.md)

## 从源码工作区运行

默认 Genesis Web 组合使用 Node.js 24.9 或更新版本，并安装工作区依赖，以下命令在仓库根目录执行。完整构建需要 Git 元数据；缺少 `.git` 的源码归档无法提供构建提交号。

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run build:artifacts
pnpm run build:check
```

`--ignore-scripts` 不运行依赖安装钩子；所需原生构建产物由仓库构建命令生成。真实模型对话需要配置 Harness 模型提供方。Genesis 自动化测试使用脚本化适配器，无需 API Key。

本工作区的 Web 启动默认加载生命核心、首次唤醒、B 站集成和浏览器配套配置，监听 `0.0.0.0:4004`，使用网页密钥登录。构建完成后运行：

```sh
pnpm dsh
```

`pnpm dsh web`、`pnpm start:web` 和 `make web` 使用相同默认配置，开发模式也沿用它。默认 `DSH_HOME` 为 `~/.genesis-harness`；显式设置的 `DSH_HOME` 和 `--port` 优先，额外 `--patch` 在默认配置之后应用。无需再设置 `PNPM_MANAGE_PACKAGE_MANAGER_VERSIONS`。先配置 API 或登录，再在知识库完成嵌入配置，详见[首次唤醒](awakening.zh.md)。

本机浏览器测试可运行 `pnpm dsh web --test-no-login`。打开启动时输出的已认证地址，启动令牌会换取浏览器 Cookie，无需填写密钥登录表单。此开关仅属于源码工作区，将测试补丁放在最后，即使指定 `--host` 也固定监听 `127.0.0.1`，并保留 `--port`。API 认证仍然开启，直接访问根地址仍须有效 Cookie。不加此参数即可恢复密钥登录。自动化测试使用独立的临时 `DSH_HOME`。

需要普通 Harness Web 时使用 `pnpm dsh --no-genesis web`。此开关只属于工作区启动层；已发布的 `dsh` CLI、其他配置和桌面应用保留原有默认行为。下面是显式启用部分 Genesis 功能的示例。

### B 站经历

工作区 Genesis Web 包含 [B 站集成](../../packages/experimental/genesis-bili-humanism/README.zh.md)。使用 `pnpm dsh web` 重启服务，再在 Life 模式通过 `learn` 学习准确工具名，无需额外补丁参数。集成仍关闭上游人格学习、定时取稿和平台写入，由 Genesis 管理候选经历。

### 浏览器操作

工作区 Genesis Web 默认启用 [Playwright 浏览器组合包](../../packages/experimental/browser-use-playwright-mcp/README.zh.md)，连接在 Genesis 服务器上独立运行的专用 Chrome，默认地址为 `http://127.0.0.1:9222`。在 **设置 → 浏览器** 修改 **Chrome 调试地址** 并保存。地址从服务器访问，而不是从你的本地电脑访问；支持 HTTP(S) 和 WS(S) 调试地址。配置保存在 profile 中，重启后保留。保存不测试连通性。保存后重启 Genesis，共享提供方便会连接新地址。

在已安装 Chrome 且有活动图形会话的 Linux 服务器上，安装仓库提供的用户服务：

```sh
install -Dm644 config/systemd/genesis-chrome.service ~/.config/systemd/user/genesis-chrome.service
systemctl --user daemon-reload
systemctl --user enable --now genesis-chrome.service
pnpm dsh web
```

该服务运行有窗口的 Chrome，使用独立配置目录 `~/.genesis-harness/browser/chrome` 和回环调试端口。可通过 systemd 服务覆盖配置修改 `GENESIS_CHROME_PROFILE` 或 `GENESIS_CHROME_PORT`；修改端口后同步修改 UI 地址。服务继承用户管理器的图形环境，需要可用的 X11/Xwayland 显示。Chrome 与 DSH 独立运行，停止 DSH 会保留 Chrome 和页面。Chrome 正常或异常退出后，服务都会自动重启它；需要明确停止时使用 `systemctl --user stop genesis-chrome.service`。原有 `$DSH_HOME/browser/playwright` 配置目录保留，不会自动导入 Chrome。配置目录包含敏感登录数据，备份或删除前应停止 Chrome。

所有对话共享同一个 Chrome、页面与网站身份。工具单次调用串行执行，不同对话的多次调用工作流仍可能交错。Chrome 不可用时，浏览器操作会报告连接错误，不会启动替代浏览器。恢复 Chrome 后再试；已有连接仍不可用时重启 Genesis。此连接关闭内置 **AI 浏览器** 预览；通过服务器图形桌面的 Chrome 窗口查看网页、登录及人工接管。该服务不提供远程桌面。

生命模式须通过 `learn` 学习准确工具名，例如 `mcp__playwright-mcp__browser_navigate`、`mcp__playwright-mcp__browser_snapshot`、`mcp__playwright-mcp__browser_click` 和 `mcp__playwright-mcp__browser_fill_form`。学会工具不代表获得外部操作授权。截图需要支持图片的模型路由，文本模型可使用页面文本快照。此连接仍通过 Playwright 操作，不保证消除网站风控。调试端口应仅监听回环地址；远程访问须使用受保护的隧道，因为该端点可以控制已登录的网站。

### GNOME Wayland 桌面控制

工作区 Genesis Web 在 GNOME Wayland 下加载[桌面 portal provider](../../packages/experimental/computer-use-portal/README.zh.md)。使用 `pnpm dsh` 重启，并教她准确工具名 `computer`。首次 `connect` 会打开 GNOME 屏幕共享和远程输入授权对话框。优先使用应用检查与语义控制：列出应用、选择一个应用实例，再读取控件、调用其动作或直接替换可编辑文本。无障碍支持不足时，工具还支持对一个共享显示器截图、指针输入、滚动和快捷键。坐标和键盘输入需要最近截图；按键作用于当前获得焦点的应用。工作区覆盖层已预先批准应用访问，不再逐应用询问；仍须完成 GNOME 系统共享授权。provider 使用 XDG portal 和 PipeWire，无需 Shell 扩展。

使用 `GENESIS_COMPUTER_USE=0` 禁用桌面工具。provider 启动时检查所需 Python/GI 与 GStreamer 依赖；配置和恢复方式见其 README。授权是临时的，重启后须重新批准。GNOME 的停止共享控制可撤销访问。学习状态独立持久保存，不授予操作系统权限；截图需要支持图像输入的模型路由。

### 显式组合配置

通过核心补丁显式启用基础能力。实验请指定独立的绝对路径 `DSH_HOME`，再次启动时保持同一路径以恢复同一生命。

```sh
pnpm dsh --profile headless --patch packages/experimental/genesis/cordis.patch.yml --dump-config
```

配置转储用于验证组装，不创建生命、不调用模型。配置模型后，将 `--dump-config` 替换为任务即可进行对话。

Web 状态展示需要同时应用下面两个补丁。左侧会增加 Genesis 入口，集中提供生命信息、记忆、委派任务及发件记录；模型与连接配置保留在“设置 → 知识库”。刷新会请求新的认证状态样本。

```sh
pnpm dsh --no-genesis web --patch packages/experimental/genesis/cordis.patch.yml --patch packages/experimental/client-ui-genesis/cordis.patch.yml --dump-config
```

构建后去掉 `--dump-config` 即可启动 Web，监听与认证由显式组合的配置决定，Genesis 不新增独立监听端口。界面显示上次刷新时间；刷新失败时保留旧样本并显示警告。

需要先配置凭据、命名、新生角色和持久工具学习时，请使用[首次唤醒教程](awakening.zh.md)。生命覆盖配置包含独立记忆流水线，最初只向模型开放学习工具。

## 查询与记忆

通过 `genesis_self` 查询身份和诞生时间，使用 `genesis_recall` 搜索记忆，使用 `genesis_history` 查询事实或成长。明确要求记忆并写出原文，例如“请记住：我喜欢乌龙茶”。`genesis_remember` 只接受最近观察到的真实用户消息中的原文，并保存为带来源的候选记忆。

在工作区 Web 启动时添加前置 `--no-genesis` 即可禁用默认 Genesis；其他配置下省略 Genesis 补丁即可禁用；单独禁用 Web 配套插件只移除主页及设置贡献。这些操作均不删除生命数据。

## 限制

可选[情绪](emotion.zh.md)保存即时状态与较慢的心境，工作区生命覆盖配置默认启用。可选[兴趣](interest.zh.md)从带来源的交流形成，不预设喜欢的主题。可选[审议](motivation.zh.md)让主模型通过显式工具与可读 ID 管理持久动机和跨会话计划；自主任务调度、反思与自我完善尚不可用。工具发现记录可用性，不代表掌握能力或已获权限。可选[记忆流水线](memory.zh.md)提供嵌入搜索和独立更新；自动插件安装和自主修改源码仍不可用。

## 开发说明

无。
