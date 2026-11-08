# Genesis 生命服务

[English](genesis.md) | 中文

可选的 [Genesis 层](../genesis/README.zh.md)负责持久生命、带来源记忆与系统成长观察。[数据记录](../genesis/data-model.zh.md)定义身份连续性与证据，[集成架构](../genesis/architecture.zh.md)定义生命周期与权限归属。

`BoredomState` 是可选 `EmotionState.boredom` 的类型，保存在线活动模式、强度与时间参数。`EmotionUpdate.boredomDelta` 是带引用的有界评价，`SpontaneityRun.social` 保留自主发送预留及结果。`IdleConversationProvider` 为仅在内部联想可用的工具提供获准在线目标与持久文字投递。[无聊](../genesis/emotion.zh.md)和[空闲机会](../genesis/spontaneity.zh.md)定义行为与权限。

`ThoughtId` 独立于目标和 Session 标识一个 `LifeThought`。`SpontaneityRun` 记录一次预留内部区间及其实际结算；第一版念头存储域保留当前投影和带来源的编辑凭据。探索决策使用 `purpose: exploration`，既有决策仍可读取。[自发认知](../genesis/spontaneity.zh.md)定义选择、私有执行、预算、删除和恢复。

`ToolkitId` 标识操作者拥有的 `ToolkitDefinition`，`ToolkitStatus` 返回带修订号的目录及已学会、已注册工具名。`GenesisToolkitGateway` 管理认证后的编辑，`genesisToolkits` Session 投影恢复带版本的启用记录。[工具包](../../packages/experimental/genesis/README.zh.md#toolkits)定义成员、可见性、限制和执行检查。

可选的版本 3 `EmotionState` 分别保存九项即时 `EmotionCurrent`、二维 `Mood` 心境与独立 `Needs`；恢复参数、修订、操作者设置及可选的单个 `RelationshipState` 与锚点一同持久化。关系保存五项估计、各字段置信度和来源；`RelationshipAdjustment` 是带原因的明确操作者输入。`EmotionUpdate` 携带有来源的事件评价、有界的情绪/心境/需求变化、可选关联对象与关系变化。`EmotionDialogue` 是有界可重放交流窗口。`EmotionSettings` 控制评价及恢复，用共享 `sensitivity` 倍率调节情绪及关系变化，`EmotionAdjustment` 替换三层情感状态。`EmotionHistoryEntry` 返回有界、带归属的变化、解释和实际应用效果。`LifeCore.reviewEmotion` 将变化、证据与重放标记一同提交，时机、迁移与失败语义见[情绪](../genesis/emotion.zh.md)。

`QqMessageReceipt` 是 `genesis_qq_messages` 中的第一版跨会话投递日志。`QqMessenger` 路由操作者请求，仅主机可用的 `genesisQqMessages` 投影保留有界原始输入及当前轮次权限证据。[QQ 发消息](../genesis/qq.zh.md#cross-conversation-messages)定义目标解析、来源归属、幂等和未知结果。

`Config.memorySharing` 为提示词、回忆和辅助推理选择生命范围共享或来源对话隔离；生命覆盖层选择 `life`，单独挂载默认使用 `conversation`。[记忆指南](../genesis/memory.zh.md)定义所包含的记录及独立权限检查。

`LifeMemory.summary` 和 `MemoryRevision.summary` 可选地保存独立于全文的短描述。`GenesisMemoryGateway.saveSummary` 和 `summarize` 根据所显示的记忆版本仅更新该描述。[记忆](../genesis/memory.zh.md)定义多轮证据、摘要上限与恢复行为。

[B 站读取](../../packages/experimental/genesis-bili-humanism/README.zh.md)使用统一文字记录存储。`WritingImportId` 标识可信适配器的回执；迁移保留原始创建时间，记录实际迁移的 Session 与工具调用，重试时保留人工编辑和删除结果，不添加生命记忆。

`MemoryModelsSettings.maxRetries` 可选地覆盖共享辅助推理的部署重试次数，缺省时沿用部署值。[记忆](../genesis/memory.zh.md)定义可重试失败、取消与审计行为。

`ConversationMemoryScope` 标明 Session 及其所有选中记忆版本；`LifeCore.reviewMemory` 为 `GenesisMemoryGateway.overview` 原子检查该范围，私有 `genesisConversationMemory` 投影仅提供真实用户与助手文本。[会话记忆行为](../genesis/memory.zh.md)定义选择、预算与恢复。

`MemoryOrganizationRequest` 携带带品牌的请求 ID、所选记忆版本及可选精确结果条数。`OrganizedMemory` 是 `LifeCore.organizeMemories` 接受的已校验、带嵌入推断；`GenesisMemoryGateway.organize` 提供手动归纳。[整理选中记忆](../genesis/memory.zh.md#selected-memory-organization)说明限制与恢复规则。

`OperatorIdentity` 表示明确填写的操作者姓名和身份；可选持久化资料带修订号和来源生命事件。`MemoryRelabel` 表示已验证的称呼替换及重建向量。`LifeState.suppressedHabitEvidence` 在直接人工编辑后排除旧习惯证据，无需记录修改历史。日历时间标记与角色读取的相对时间见[记忆时间](../genesis/memory.zh.md#memory-time)。

`WritingEntry` 保存角色文字、不可变的创建归属和带版本的人工编辑；`WritingType` 保存稳定类型编号和可编辑名称。`WritingSearch` 与 `WritingRead` 返回有界匹配结果和正文分段。`GenesisRecordsGateway` 负责已认证的后台管理，可选的已学工具复用同一记录所有者。[文字记录](../genesis/records.zh.md)定义文件持久化、独立于记忆的语义及恢复。

`AgencyState` 拥有持久动机、跨会话生命目标和决策历史。`PlanChange` 描述通过 `genesis_plan` 执行的主模型显式编辑，`LifeCore` 原子提交工具调用证据、版本和变更。`LifeDeliberationEngine` 将计划思考机会交给主模型，并保留独立的只读交流判断。[生命计划](../genesis/motivation.zh.md)定义 ID、变更与恢复。

`genesis-task` 将分配任务归属到发起会话、生命范围请求标识和输入指纹。`genesisTask` 投影保留该归属、已记录轮次结果及原始结果事件引用，不更新生命记忆。`LifeStatus.lifePreset` 告知浏览器哪些会话参与生命操作。[工作区任务](../genesis/tasks.zh.md)定义隔离、分配、去重与恢复行为。

`ManagedTaskCatalog` 返回带采样时间的分页操作者视图，包含带品牌的任务/工作区 ID、工作区名称、模式、投递与执行状态、轮次数和活动数量。`readable` 表示原会话可供导航，`confirmed` 区分成功读取和证据不可用。`GenesisTaskGateway.catalog` 排除已归档或不可访问工作区，不加载或恢复 Agent。[工作区任务](../genesis/tasks.zh.md)定义权限、限制与恢复。

`genesis-state` 在既有用户消息信封上标记有界的命名生命模块快照。列出的模块仅替换各自旧值，空文本清空该模块，未列出的模块继续有效。适配层比较保留的消息投影，不维护未记录的发送状态。[包上下文行为](../../packages/experimental/genesis/README.zh.md#model-experience)定义模块选择与恢复。

[Minecraft](../../packages/experimental/genesis-minecraft/README.zh.md)负责可选的 Java 版游戏连接、有界技能、独立 Jev 监测与操作者设置。游戏观察作为带来源消息进入生命 Session；连接状态不会恢复为活动技能。

[视频制作](../../packages/experimental/genesis-video/README.zh.md)拥有带生命归属的 Remotion 工程、不可变修订、导入素材与沙箱渲染任务。工具学习、执行权限和渲染成功分别记录；缺少终态回执的任务在重启后显示中断，不自动重跑。

`PersonId` 标识鉴权的 QQ 人物，不依赖名称或 Session。`ConversationId` 和 `LifeConversation` 将群聊及私聊路由绑定到持久化 Session；`PersonSource` 是记录在日志中的 `genesis-person` 归属。可选的版本 1 `LifeState.people` 只保留有意义的 `LifePerson` 关系档案、显式操作者绑定和对话路由。`QqController` 管理独立持久化的 `QqConnection`、凭据和传输切换；`QqRuntime` 负责传输就绪与输入准入，控制器提供持久发送回执；Genesis 负责关系学习和记忆场景检查。[QQ 对话](../genesis/qq.zh.md)定义部署、保留、失败和权限语义。

`LifeContact` 将称呼、QQ、邮箱及其他账号关联到与关系记录相同的 `PersonId`。`ContactInput` 替换所有可编辑字段，`ContactCatalog` 提供有界搜索分页。可选的第一版 `LifeState.contacts` 通过生命事务和备份恢复保留更新。`GenesisContactsGateway` 负责操作者界面访问；带日志的 `genesis_contacts` 工具负责操作者对话中的模型读取与编辑。详见[联系人](../../packages/experimental/genesis/README.zh.md#use)。 联系人还持有唯一操作者标记，并投影到已有的人物操作者 ID 供 QQ 消费方使用。启动时一次性补齐保留的关系，建立新关系时关联或创建联系人，不覆盖已有地址。

`QqDecisionSettings` 选择明确复用、既有提供商／模型，或拥有独立凭据引用的概率端点。`QqDecisionReceipt` 将有界真实概率及结果关联到群／消息及 Session ID。[QQ 对话](../genesis/qq.zh.md)说明设置、媒体／引用范围及删除方式。

可选的[邮件集成](../../packages/experimental/genesis-mail/README.zh.md)拥有归属生命的邮箱存储、独立角色注意状态和不可变 SMTP 预留。`MailId` 独立于提供方 UID 和 Message-ID 标头标识本地邮件；`MailStatus` 开放不含凭据值的有界元数据。`LifeCore.recordIntegrationState` 将实际观察到的集成初始化和连接记录为系统成长，与工具学习和执行权限分别记录。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxgenesis--lifecore"></a>

### `ctx.genesis` — `LifeCore`

One life owner. Writes serialize components and replace one manifest, so facts and state commit together. Storage failures poison this instance until reload; validation and capacity refusals leave it usable. Returned data is detached.

```ts cordis-catalog
/** Match an email address against the operator selected in Contacts.
 * @param address - Parsed sender address; transport authentication is checked separately.
 * @returns Whether the current operator contact explicitly owns this address.
 */
isOperatorEmail(address: string): boolean

/**
 * Search contacts by name, person ID or address without loading relationship evidence.
 * @param query - Case-insensitive substring, or empty for all contacts.
 * @param offset - Zero-based page offset.
 * @returns A detached page bounded by queryLimit and resultChars.
 */
async contacts(query: string, offset: number = 0): Promise<ContactCatalog>

/**
 * Save addresses under the same QQ-derived identity as relationship records.
 * @param input - Complete contact replacement; an existing person ID must match the QQ account.
 * @param evidence - Optional actual Session evidence for a model-authored update.
 * @param operator - Explicit operator UI selection; omitted preserves authority and is unavailable to model edits.
 * @returns The durably committed contact; repeated unchanged saves create no new event.
 */
saveContact(input: ContactInput, evidence?: { sessionId: SessionId; eventId: string }, operator?: boolean): Promise<LifeContact>

/**
 * Remove current addresses while preserving relationship history and Session audit logs.
 * @param personId - Stable person ID selected from a contact result.
 * @param evidence - Optional logged tool call responsible for deletion.
 * @returns Whether a contact was removed.
 */
deleteContact(personId: PersonId, evidence?: { sessionId: SessionId; eventId: string }): Promise<boolean>

/**
 * Bind an authenticated platform route to one durable Session before accepting messages.
 * @param conversation - Exact route and reserved Session; reuse may not silently replace it.
 * @param operatorPersonId - Legacy deployment seed used only until Contacts owns operator selection.
 * @returns After the route is durable; conflicting routes or operator identities are refused.
 */
bindConversation(conversation: LifeConversation, operatorPersonId?: PersonId): Promise<void>

/**
 * Confirm successful Session publication before any external input can be reserved.
 * @param sessionId - Successfully created or resumed bound Session.
 * @returns After the publication marker is durable; repeats are idempotent.
 */
confirmConversationSession(sessionId: SessionId): Promise<void>

/**
 * Delete a retained profile, its contact details, earlier account recognition and memories citing that person's messages, preserving audited Session evidence.
 * @param personId - Explicit operator-selected identity; names cannot select a person.
 * @param updatedAt - Optional displayed profile version; changed or missing profiles refuse deletion.
 * @returns Whether a retained profile existed; raw Session logs require separate lifecycle deletion.
 */
forgetPerson(personId: PersonId, updatedAt?: string): Promise<boolean>

/**
 * Reserve one authenticated platform delivery before queueing it; uncertain deliveries are never replayed automatically.
 * @param sessionId - Previously bound route's Session.
 * @param source - Validated transport author and external message identifier.
 * @param digest - Hash of the complete admitted content, preventing conflicting retries.
 * @returns Whether this caller reserved the delivery; an identical replay returns false.
 */
reservePersonMessage(sessionId: SessionId, source: PersonSource, digest: string): Promise<boolean>

/**
 * Reserve one external assistant delivery before calling the platform; a crash leaves an explicit unknown result.
 * @param sessionId - Bound channel Session containing the committed assistant message.
 * @param seq - Committed assistant event sequence, unique within that Session.
 * @param parts - Complete number of planned outbound chunks.
 * @returns Whether this caller owns the send; replay never sends twice.
 */
reserveQqReply(sessionId: SessionId, seq: number, parts: number): Promise<boolean>

/**
 * Record actual platform acknowledgements, retaining partial sends and unknown outcomes without retrying them.
 * @param sessionId - Reserved reply's Session.
 * @param seq - Assistant event sequence.
 * @param status - Confirmed only when every planned chunk was acknowledged.
 * @param messageIds - Actual OneBot message identifiers received before settlement.
 * @returns After the append-only receipt is durable; repeated identical receipts are idempotent.
 */
settleQqReply(sessionId: SessionId, seq: number, status: 'confirmed' | 'uncertain', messageIds: string[]): Promise<void>

/**
 * Check whether a model conversation may use operator-owned tools and legacy private memories.
 * @param sessionId - Actual invoking Session.
 * @returns False for groups and unbound external people; familiarity never grants authority.
 */
isOperatorSession(sessionId: SessionId): boolean

/**
 * Identify a bound QQ Session for channel-specific data and tool restrictions.
 * @param sessionId - Actual calling Session.
 * @returns Whether the Session belongs to the authenticated QQ adapter.
 */
isQqSession(sessionId: SessionId): boolean

/**
 * Match an authenticated account to the contact operator; names and relationships never qualify.
 * @param personId - Transport-verified person identity.
 * @returns Whether this exact account has the durable operator binding.
 */
isOperatorPerson(personId: PersonId): boolean

/**
 * Subscribe to newly committed life events; listeners must contain their own asynchronous failures.
 * @param listener - Nonthrowing observer; callbacks must not mutate event values.
 * @returns Disposer for the subscription.
 */
onCommitted(listener: (events: readonly LifeEvent[]) => void): () => void

/** Initialize the optional outbox without replacing prior history.
 * @returns After the state is durably initialized.
 */
initializeInitiative(): Promise<void>

/**
 * Save complete proactive policy atomically; enabling starts with current events, preserving existing pending records.
 * @param settings - Validated operator policy.
 * @param revision - Last displayed settings revision; receipt changes do not invalidate a draft.
 * @returns New revision, only after durable commit.
 */
configureInitiative(settings: InitiativeSettings, revision: number): Promise<number>

/**
 * Advance the event catch-up cursor monotonically without manufacturing an experience.
 * @param eventId - Last examined committed event.
 * @returns After the cursor is durable; old cursors cannot move it backwards.
 */
advanceInitiativeCursor(eventId: LifeEventId): Promise<void>

/**
 * Record one replay-safe opportunity even when no conversation channel is available.
 * @param key - Stable timer bucket or event identity.
 * @param sourceEventId - Actual trigger or most recent recorded life event.
 * @returns Existing or newly pending opportunity; capacity exhaustion remains visible.
 */
requestInteraction(key: string, sourceEventId: LifeEventId): Promise<InteractionRecord>

/**
 * Commit a delivery transition and its reason, content or receipt with the existing atomic life write.
 * @param record - Engine-owned record derived from the latest life snapshot.
 * @returns After the transition is durable; terminal receipts cannot be overwritten.
 */
saveInteraction(record: InteractionRecord): Promise<void>

/**
 * Initialize once or restore the same life; birth and initial memory commit atomically.
 * @returns Resolution only after durable startup.
 */
start(): Promise<void>

/**
 * Record an actual application deliberation trigger without copying user text.
 * @param sessionId - Audit Session receiving the trigger.
 * @param key - Caller-owned stable replay key, scoped to this Session.
 * @param kind - Request admission or externally delivered event.
 * @param source - Required existing life event for an external trigger; absent for requests.
 * @returns Original or newly committed trigger fact.
 */
prepareDeliberation(sessionId: SessionId, key: string, kind: 'request' | 'event', source?: LifeEventId): Promise<LifeEvent>

/** Record a trusted sleep transition or initialization without admitting a chat message.
 * @param key - Stable operation receipt key.
 * @param kind - Sleep event suffix.
 * @param payload - Nonsecret state and source references.
 * @returns Committed life event, including on replay.
 */
recordSleep(key: string, kind: string, payload: LifeEvent['payload']): Promise<LifeEvent>

/** Initialize the independent thought store ownership marker without creating another life.
 *
 * @returns After the marker commits; a missing marked store must be restored by its owner.
 */
initializeSpontaneity(): Promise<void>

/** Record an internal Session before it can receive input; the marker also fences cold resumes.
 *
 * @param sessionId - Reserved internal identity.
 * @param sourceEventId - Actual triggering life event.
 *
 * @returns After source attribution commits; no Agent is created by this method.
 */
beginSpontaneitySession(sessionId: SessionId, sourceEventId: LifeEventId): Promise<void>

/** Identify internal Sessions without opening their logs.
 *
 * @param sessionId - Candidate identity.
 * @returns Whether life history records an internal interval.
 */
isSpontaneitySession(sessionId: SessionId): boolean

/**
 * Publish a validated deliberation and all its state transitions atomically.
 * @param commit - Captured evidence, revision and proposal from the owning integration.
 * @returns Committed choice; replay returns the original choice without further changes.
 */
commitDeliberation(commit: DeliberationCommit): Promise<LifeDecision>

/**
 * Commit a main-model plan edit and its tool-call evidence atomically; failures preserve previous state.
 * @param change - Validated explicit create/update with the observed agency revision.
 * @param source - Actual calling Session and logged tool call, supplied by the integration.
 * @returns Stable plan id and committed revision; an identical replay returns its original receipt.
 */
editPlan(change: PlanChange, source: { sessionId: SessionId; callId: ToolCallId }): Promise<{ id: PlanChange['id']; revision: number }>

/**
 * Reserve one main-model planning opportunity; replay never queues the same opportunity again.
 * @param sessionId - Actual receiving conversation.
 * @param key - Trusted adapter's stable replay key.
 * @param sourceEventId - Existing life evidence that prompted consideration.
 * @returns A new reservation, or undefined for a replay; reservation alone does not confirm dispatch.
 */
reservePlanning(sessionId: SessionId, key: string, sourceEventId: LifeEventId): Promise<LifeEvent | undefined>

/**
 * Reserve an autonomous follow-up once before enqueueing; a crash leaves an explicit uncertain admission.
 * @param id - Pending externally triggered choice.
 * @returns Whether this caller acquired dispatch; replay and settled choices return false.
 */
reserveDecisionDispatch(id: DecisionId): Promise<boolean>

/**
 * Check the committed decision synchronously at tool execution; poisoned storage refuses access.
 * @param id - Choice admitted by this live Agent's integration.
 * @returns Whether willingness permits task tools; execution authorization remains independent.
 */
permitsDecision(id: DecisionId): boolean

/**
 * Attach observed Session result references and update failure history, without claiming goal completion.
 * @param id - Committed decision whose execution has settled.
 * @param outcome - Host-derived result, never model-authored text.
 * @param sources - Actual observed life event IDs from this decision's Session.
 * @returns After result publication; repeat settlements are no-ops.
 */
settleDecision(id: DecisionId, outcome: LifeDecision['outcome']['status'], sources: LifeEventId[]): Promise<void>

/**
 * Record an explicit operator pause, resume or abandonment without changing goal origin or completion.
 * @param id - Stable goal identifier.
 * @param status - Active, paused or abandoned; completion requires verified execution.
 * @param revision - Displayed agency revision for optimistic concurrency.
 * @param reason - Human explanation, validated at this application input.
 * @returns After the history and current state commit; stale edits leave both unchanged.
 */
setLifeGoalStatus(id: LifeGoalId, status: 'active' | 'paused' | 'abandoned', revision: number, reason: string): Promise<void>

/**
 * Confirm goal completion after independent application verification of a successful linked execution.
 * @param id - Active life goal; ordinary chat and deliberation proposals cannot complete it.
 * @param decisionId - Settled successful execution linked to this goal.
 * @param evidence - Successful tool-result fact from that decision's observed outcome.
 * @returns After completion and its immutable history commit; replay is idempotent.
 */
completeLifeGoal(id: LifeGoalId, decisionId: DecisionId, evidence: LifeEventId): Promise<void>

/**
 * Commit one sourced interest interpretation and a replay marker together.
 * @param sessionId - Conversation whose committed exchange supplied the evidence.
 * @param current - Current completed exchange; older turns are context only.
 * @param proposals - Validated writer proposals, or an empty list for no change.
 * @returns After durable publication; replay of this exchange has no effect.
 */
reviewInterest(sessionId: SessionId, current: InterestDialogue['turns'][number], proposals: InterestProposal[]): Promise<void>

/**
 * Read committed state after all previously accepted observations settle.
 * @returns Detached life snapshot; rejects when closed or storage is untrusted.
 */
async snapshot(): Promise<LifeState>

/**
 * Commit an emotion appraisal and its deduplication marker atomically with cited life evidence.
 * @param sessionId - Source conversation, never another Session's text.
 * @param evidence - Current exchange and optional earlier complete exchanges.
 * @param revision - Emotion revision captured before inference; stale proposals are refused.
 * @param update - Validated signed changes; omitted records a no-change decision.
 * @returns After durable commit; replay is a no-op and storage uncertainty stops dependent operations.
 */
reviewEmotion(sessionId: SessionId, evidence: EmotionDialogue['turns'], revision: number, update?: EmotionUpdate): Promise<void>

/**
 * Record an online idle opportunity with its sampled boredom, never an invented interaction.
 * @param sessionId - Live source conversation supplying the execution ceiling.
 * @param key - Stable opportunity key reserved by the idle scheduler.
 * @returns Committed source event; replay returns the same event.
 */
reserveBoredomOpportunity(sessionId: SessionId, key: string): Promise<LifeEvent>

/**
 * Settle elapsed engagement time before changing its mode; no inference or relationship change occurs.
 * @param mode - Runtime-observed activity, never a model claim of completed work.
 * @returns After a changed mode and its source record commit; unchanged modes do not write.
 */
setBoredomMode(mode: BoredomState['mode']): Promise<void>

/**
 * Save elapsed online affect time without changing operator revisions or creating an experience.
 * @returns After the online-only anchor is durable; storage uncertainty stops dependent operations.
 */
checkpointEmotion(): Promise<void>

/**
 * Save operator emotion rules with revision fencing; recovery under the old rules precedes the change.
 * @param settings - Validated complete operator choices; they take precedence over deployment defaults.
 * @param revision - Last displayed emotion revision; concurrent appraisals or edits reject this write.
 * @returns Committed revision; backup uncertainty stops dependent operations until verified reload.
 */
configureEmotion(settings: EmotionSettings, revision: number): Promise<number>

/**
 * Set operator-selected absolute intensities without manufacturing dialogue evidence.
 * @param adjustment - Validated immediate/mood/need values and nonempty operator reason.
 * @param revision - Last displayed emotion revision; stale edits leave state unchanged.
 * @returns Committed revision; the next request receives the adjusted state through logged context.
 */
adjustEmotion(adjustment: EmotionAdjustment, revision: number): Promise<number>

/**
 * Replace the deployment operator's relationship estimates with an explicit attributed adjustment.
 * @param adjustment - Validated display label, five values and audit reason.
 * @param revision - Last observed emotion revision; conflicting changes reject atomically.
 * @returns Committed emotion revision; manual estimates do not become dialogue evidence.
 */
adjustRelationship(adjustment: RelationshipAdjustment, revision: number): Promise<number>

/**
 * Read committed naming, learned tools and the first conversation, without copying another Session's context.
 * @returns Detached global life progress; an untrusted or closed core rejects.
 */
learningStatus(): { ready: boolean; tools: string[]; firstSessionId?: SessionId; firstConversationComplete: boolean }

/**
 * Name the existing life once after the application has checked model configuration; never create a second identity.
 * @param name - User-selected name, validated before storage admission.
 * @returns After naming commits; repeating the same name is idempotent and a conflicting name is refused.
 */
awaken(name: string): Promise<void>

/**
 * Bind the first accepted conversation once; subsequent Sessions retain their own context.
 * @param sessionId - Session receiving the first accepted user or built-in awakening input.
 * @returns After the first-conversation fact commits, or after an idempotent repeat.
 */
beginConversation(sessionId: SessionId): Promise<void>

/**
 * Record completion only after the canonical first Session commits a successful turn with a text reply.
 * @param sessionId - Actual completed conversation.
 * @param eventId - Durable turn-end sequence, retained as source evidence.
 * @param timestamp - Source event time.
 * @returns After the idempotent completion fact is durable; unrelated Sessions do not complete initialization.
 */
completeFirstConversation(sessionId: SessionId, eventId: string, timestamp: string): Promise<void>

/**
 * Persist one tool-learning event, independently of availability and execution permissions.
 * @param tool - Exact current tool name checked by the learning tool against the caller's registry.
 * @param sessionId - Actual learning Session.
 * @returns After learning and its growth record commit together; repeats do not duplicate them.
 */
learn(tool: string, sessionId: SessionId): Promise<void>

/**
 * Record the stable private host directory without replacing an existing location silently.
 * @param path - Prepared canonical directory authorized by deployment configuration.
 * @returns After the location is durable; a conflicting configured location is refused.
 */
setPersonalDirectory(path: string): Promise<void>

/**
 * Save explicit operator identity with version-fenced current-memory relabeling.
 * @param profile - Authenticated human-authored name and identity.
 * @param revision - Displayed operator revision, zero before first configuration.
 * @param versions - Complete memory set captured before inference; concurrent edits refuse publication.
 * @param changes - Validated wording-only replacements and refreshed embeddings.
 * @returns New identity revision; original interpretations remain in version history.
 */
saveOperator(profile: OperatorIdentity, revision: number, versions: Array<{ id: MemoryId; updatedAt: string }>, changes: MemoryRelabel[]): Promise<number>

/**
 * Append an attributed fact once, identified by Session plus durable sequence.
 * @param observation - Actual Session event metadata, never a model assertion.
 * @returns Committed fact, including the original fact for duplicate delivery.
 */
observe(observation: ObservedInteraction): Promise<LifeEvent>

/** Record an optional integration's observed state without granting tool permission.
 * @param name - Stable integration name.
 * @param status - Actual initialization or transport observation; initialization is recorded once.
 * @param detail - Nonsecret evidence describing what was observed and what remains unverified.
 * @returns Durable observation; repeated unchanged states reuse their previous event.
 */
recordIntegrationState(name: string, status: 'initialized' | 'connected' | 'disconnected', detail: string): Promise<LifeEvent>

/**
 * Bind an actual created or resumed Session to this life without changing identity.
 * @param sessionId - Harness Session identifier.
 * @param source - Actual Harness creation/resume source.
 * @param tools - Optional initial inventory committed atomically with the binding.
 * @returns After the binding and supplied inventory commit; repeat observations are idempotent.
 */
bind(sessionId: SessionId, source: string, tools?: readonly ToolSchema[]): Promise<void>

/**
 * Record the first tool inventory as a baseline, then compare declarations in the same Session.
 * Baselines are observations, not growth; permissions and learned skills remain independent.
 * @param sessionId - Scope whose previous observation is compared.
 * @param tools - Current registry projection before the character's learned-tool restriction.
 * @returns After the baseline or subsequent capability changes commit with their source events.
 */
scan(sessionId: SessionId, tools: readonly ToolSchema[]): Promise<void>

/**
 * Create a sourced memory. Caller interpretation remains a candidate, never an automatic fact.
 * @param input - Validated memory fields with existing life-event references.
 * @returns Newly committed memory.
 */
remember(input: MemoryInput): Promise<LifeMemory>

/**
 * Create a complete batch of sourced candidates atomically, retaining existing identical memories.
 * @param inputs - Memory fields with existing life-event references; all are validated before commit.
 * @returns Committed memories in input order; validation failures create no memories.
 */
rememberBatch(inputs: MemoryInput[]): Promise<LifeMemory[]>

/**
 * Replace mutable memory fields, retaining identity and creation time.
 * @param id - Memory identifier.
 * @param input - Complete replacement and evidence.
 * @returns Committed replacement, or undefined if absent.
 */
updateMemory(id: MemoryId, input: MemoryInput): Promise<LifeMemory | undefined>

/**
 * Create a sourced operator candidate or directly edit its current projection without an edit event or revision history.
 * @param id - Client-allocated UUID; retaining it makes retries of a new entry idempotent.
 * @param draft - Editable candidate fields, never caller-supplied source references.
 * @param updatedAt - Observed version, or null for a new entry.
 * @param maxImplicit - Non-declarative count budget.
 * @returns Committed candidate retaining its identity and earlier sources when edited.
 */
editMemory(id: MemoryId, draft: MemoryDraft, updatedAt: string | null, maxImplicit: number): Promise<LifeMemory>

/**
 * Replace or remove only a memory's short description, preserving its evidence and behavioral metadata.
 * @param id - Existing memory identifier.
 * @param summary - At most forty characters, or null to remove the description.
 * @param updatedAt - Displayed version; concurrent content or summary edits are refused.
 * @returns Committed memory; an unchanged description adds no revision or event.
 */
setMemorySummary(id: MemoryId, summary: string | null, updatedAt: string): Promise<LifeMemory>

/**
 * Change only the memory layer, retaining content, sources, identity and its embedding.
 * @param id - Existing memory.
 * @param kind - Explicit operator choice.
 * @param updatedAt - Version observed by the editor; stale conversions are refused.
 * @param maxImplicit - Whole-life non-declarative count budget.
 * @returns Converted memory; an idempotent same-layer request leaves history unchanged.
 */
convertMemory(id: MemoryId, kind: 'declarative' | 'non-declarative', updatedAt: string, maxImplicit: number): Promise<LifeMemory>

/**
 * Delete current memory content; automatic deletion records a fact, while operator deletion creates no edit history.
 * @param id - Memory identifier.
 * @param updatedAt - Optional displayed version; when supplied, concurrent edits are refused.
 * @returns Whether a memory was durably removed.
 */
deleteMemory(id: MemoryId, updatedAt?: string): Promise<boolean>

/**
 * Rename the life through an explicit application operation; immutable birth fields stay fixed.
 * @param name - Display name or null for unnamed.
 * @returns After identity and its history commit.
 */
rename(name: string | null): Promise<void>

/**
 * Read one committed memory without activating a Session.
 * @param id - Stable memory identifier.
 * @returns A detached memory or undefined if absent or deleted.
 */
async getMemory(id: MemoryId): Promise<LifeMemory | undefined>

/**
 * Atomically apply an independent writer's changes and record a completed review once.
 * @param key - Stable source turn or explicit user-memory request key.
 * @param changes - Validated changes; all references must belong to this life.
 * @param maxImplicit - Whole-life non-declarative record limit.
 * @param experience - Optional remembered event; commits atomically with the derived entries.
 * @param evidence - Completed user exchange metadata for independent habit support and durable maintenance.
 * @param scope - Optional whole-conversation selection; every supplied version and mutation is checked atomically.
 * @returns After all changes and the replay marker commit, or no-op on replay.
 */
reviewMemory(key: string, changes: MemoryChange[], maxImplicit: number, experience?: ExperienceChange, evidence?: ReviewEvidence, scope?: ConversationMemoryScope): Promise<void>

/**
 * Persist the operator's maintenance preference independently of deployment defaults.
 * @param enabled - Whether idle maintenance may run.
 * @returns After the preference commits; pending work is retained when disabled.
 */
setConsolidation(enabled: boolean): Promise<void>

/**
 * Request one maintenance pass over current memories, retaining its source Session for the inference audit.
 * @returns After pending work and a fresh retry budget commit; absent conversation evidence is refused.
 */
requestConsolidation(): Promise<void>

/**
 * Commit one bounded consolidation with an optimistic revision check and replay marker.
 * @param plan - Validated changes and the exact selected memory versions.
 * @param maxImplicit - Whole-life prompt memory limit.
 * @returns Whether the pass committed; concurrent edits leave work pending.
 */
consolidate(plan: ConsolidationCommit, maxImplicit: number): Promise<boolean>

/**
 * Atomically replace selected memories with their sourced synthesis.
 * @param request - Stable request and exact source versions.
 * @param changes - Validated, embedded interpretations citing selected memories.
 * @param sessionId - Durable auxiliary inference audit Session.
 * @returns Committed results; retries return the same identities.
 */
organizeMemories(request: MemoryOrganizationRequest, changes: OrganizedMemory[], sessionId: SessionId): Promise<LifeMemory[]>

/**
 * Retain a safe failed maintenance outcome without discarding pending evidence.
 * @param revision - Work revision that failed; superseded work keeps its own retry budget.
 * @param failure - Classified, redacted diagnostic from the operation owner.
 * @returns After the diagnostic commits, or a no-op for superseded work.
 */
failConsolidation(revision: number, failure: ReviewFailure): Promise<void>

/**
 * Retrieve lexical memories by category, time, importance and recency.
 * @param query - Explicit result and character bounds.
 * @returns Highest-ranked whole memories fitting both limits.
 */
async retrieve(query: MemoryQuery): Promise<LifeMemory[]>

/**
 * Query facts in chronological order, with optional type/time filters.
 * @param query - Bounded query.
 * @returns Detached facts, newest matching page retained in ascending order.
 */
async events(query: EventQuery): Promise<LifeEvent[]>

/**
 * Stop admission, drain accepted observations, persist graceful stop and release the domain.
 * @returns Shared teardown promise. A stop-write failure rejects after releasing storage.
 */
close(): Promise<void>
```

Types: [ConsolidationCommit](../genesis/memory.zh.md) · [ConversationMemoryScope](../genesis/memory.zh.md) · [DecisionId](../genesis/motivation.zh.md) · [DeliberationCommit](../genesis/motivation.zh.md) · [EventQuery](../genesis/data-model.zh.md) · [ExperienceChange](../genesis/memory.zh.md) · [InitiativeSettings](../genesis/social.zh.md) · [InterestDialogue](../genesis/interest.zh.md) · [InterestProposal](../genesis/interest.zh.md) · [LifeConversation](../genesis/data-model.zh.md) · [LifeDecision](../genesis/motivation.zh.md) · [LifeEvent](../genesis/data-model.zh.md) · [LifeEventId](../genesis/data-model.zh.md) · [LifeGoalId](../genesis/motivation.zh.md) · [LifeMemory](../genesis/data-model.zh.md) · [LifeState](../genesis/data-model.zh.md) · [MemoryChange](../genesis/memory.zh.md) · [MemoryDraft](../genesis/memory.zh.md) · [MemoryId](../genesis/data-model.zh.md) · [MemoryInput](../genesis/data-model.zh.md) · [MemoryOrganizationRequest](../genesis/memory.zh.md) · [MemoryQuery](../genesis/data-model.zh.md) · [MemoryRelabel](../genesis/memory.zh.md) · [ObservedInteraction](../genesis/data-model.zh.md) · [OperatorIdentity](../genesis/memory.zh.md) · [OrganizedMemory](../genesis/memory.zh.md) · [PersonId](../genesis/data-model.zh.md) · [PersonSource](../genesis/data-model.zh.md) · [PlanChange](../genesis/motivation.zh.md) · [ReviewEvidence](../genesis/memory.zh.md) · [ReviewFailure](../genesis/memory.zh.md) · [SessionId](core.zh.md) · [ToolCallId](core.zh.md) · [ToolSchema](tools.zh.md)

Source: [`packages/experimental/genesis/src/core.ts`](../../packages/experimental/genesis/src/core.ts)

<a id="ctxgenesisagency--genesisagencygateway"></a>

### `ctx.genesisAgency` — `GenesisAgencyGateway`

Bounded agency inspection and explicit operator actions; no completion or permission mutation.

```ts cordis-catalog
/**
 * Read current motivations, goals and recent decisions under complete response and item limits.
 * @param signal - Caller cancellation; previous UI samples may be retained on failure.
 * @returns Detached state with explicit omission counts and eligible live character Sessions.
 */
@Remote('inspect') async inspect(signal: AbortSignal): Promise<AgencyStatus>

/**
 * Pause, resume or abandon a life goal with a visible operator reason; terminal goals cannot reopen.
 * @param id - Stable life goal identifier.
 * @param status - Allowed operator transition; completion is deliberately excluded.
 * @param revision - Displayed agency revision; concurrent changes are refused.
 * @param reason - Human explanation retained in life history.
 * @param signal - Caller cancellation; an admitted commit still drains.
 * @returns After the sourced state transition commits.
 */
@Remote('setGoalStatus') async setGoalStatus(id: LifeGoalId, status: 'active' | 'paused' | 'abandoned', revision: number, reason: string, signal: AbortSignal): Promise<void>

/**
 * Ask the main model in an idle character conversation to consider its plans and choose its next action.
 * @param sessionId - Live idle Session selected explicitly by the operator.
 * @param signal - Caller cancellation; committed choices remain auditable.
 * @returns After the planning opportunity is reserved and enqueued without an auxiliary choice.
 */
@Remote('deliberate') async deliberate(sessionId: SessionId, signal: AbortSignal): Promise<void>
```

Types: [AgencyStatus](../genesis/motivation.zh.md) · [LifeGoalId](../genesis/motivation.zh.md) · [SessionId](core.zh.md)

Source: [`packages/experimental/genesis/src/agency-gateway.ts`](../../packages/experimental/genesis/src/agency-gateway.ts)

<a id="ctxgenesiscompanion--companiongateway"></a>

### `ctx.genesisCompanion` — `CompanionGateway`

Internal peers cannot invoke operator controls or grant tool permissions.

```ts cordis-catalog
/** Read settings, relationship and recent internal messages.
 * @param signal - Caller cancellation.
 * @returns Bounded nonsecret sample; inspection never starts a model.
 */
@Remote('inspect') inspect(signal: AbortSignal): Promise<CompanionStatus>

/** Save settings and apply the connection without starting a conversation.
 * @param settings - Complete operator draft.
 * @param revision - Displayed settings revision.
 * @param signal - Cancellation before command admission.
 * @returns Committed revision; inspect reports connection failure separately.
 */
@Remote('save') save(settings: CompanionSettings, revision: number, signal: AbortSignal): Promise<number>

/** Save/remove the credential without returning its value.
 * @param token - Shared secret, or undefined for removal.
 * @param signal - Cancellation before command admission.
 * @returns After credential mutation and connection attempt.
 */
@Remote('setToken') setToken(token: string | undefined, signal: AbortSignal): Promise<void>

/** Start one bounded internal exchange.
 * @param topic - Explicitly shared conversation topic.
 * @param signal - Cancellation before command admission.
 * @returns After admission; status reports subsequent progress.
 */
@Remote('begin') begin(topic: string, signal: AbortSignal): Promise<void>

/** Continue one internal conversation with one more bounded exchange.
 * @param sessionId - Conversation to continue; absent keeps the current binding.
 * @param signal - Cancellation before command admission.
 * @returns After admission; status reports subsequent progress.
 */
@Remote('continueExchange') continueExchange(sessionId: string | undefined, signal: AbortSignal): Promise<void>

/** Wake one side without starting any conversation.
 * @param target - Genesis or the partner gateway schedule.
 * @param signal - Cancellation before command admission.
 * @returns After the wake override commits.
 */
@Remote('wake') wake(target: 'genesis' | 'partner', signal: AbortSignal): Promise<void>

/** Stop current model work while preserving confirmed history.
 * @param signal - Caller cancellation before stopping.
 * @returns After model and Agent cleanup.
 */
@Remote('stop') stop(signal: AbortSignal): Promise<void>
```

Source: [`packages/experimental/genesis-companion/src/gateway.ts`](../../packages/experimental/genesis-companion/src/gateway.ts)

<a id="ctxgenesiscontacts--genesiscontactsgateway"></a>

### `ctx.genesisContacts` — `GenesisContactsGateway`

Contact operations use the life owner's atomic persistence and writer lease.

```ts cordis-catalog
/** Search names and addresses.
 * @param query - Case-insensitive substring, empty for all.
 * @param offset - Zero-based page offset.
 * @param signal - Cancellation before admission.
 * @returns Bounded current contacts and continuation offset.
 */
@Remote('inspect') inspect(query: string, offset: number, signal: AbortSignal): Promise<ContactCatalog>

/** Replace a contact's editable fields.
 * @param input - Complete name, QQ, email addresses, other handles and notes.
 * @param operator - Whether this person is the single operator; selecting replaces the previous operator.
 * @param signal - Cancellation before admission; admitted writes drain on disposal.
 * @returns After the life transaction commits.
 */
@Remote('save') save(input: ContactInput, operator: boolean, signal: AbortSignal): Promise<void>

/** Remove current contact details without deleting the person's relationship.
 * @param id - Exact person ID selected from the contact catalogue.
 * @param signal - Cancellation before admission.
 * @returns After deletion commits, including an already absent contact.
 */
@Remote('erase') erase(id: PersonId, signal: AbortSignal): Promise<void>
```

Types: [PersonId](../genesis/data-model.zh.md)

Source: [`packages/experimental/genesis/src/contacts-gateway.ts`](../../packages/experimental/genesis/src/contacts-gateway.ts)

<a id="ctxgenesisdeliberation--lifedeliberationengine"></a>

### `ctx.genesisDeliberation` — `LifeDeliberationEngine`

Life-wide FIFO for inference, with per-Agent admitted execution and cancellation ownership.

```ts cordis-catalog
/**
 * Admit ordinary requests without auxiliary judgment; restore only attributed autonomous choices.
 * @param agent - Actual conversation scope.
 * @param messages - Accepted pre-step input from downstream listeners.
 * @param signal - Current turn cancellation.
 * @returns Original user input without stale choices, or validated autonomous choice notices.
 */
async admit(agent: Agent, messages: UserMessage[], signal: AbortSignal): Promise<UserMessage[]>

/**
 * Ask the main model to consider its plans, without an external model choosing a goal or action.
 * @param agent - Idle live character conversation receiving the logged opportunity.
 * @param request - Stable replay key and an existing life event, supplied by a trusted adapter or future scheduler.
 * @param caller - Caller cancellation; no background wake timer is installed.
 * @returns After reservation and enqueue; replay never redispatches an existing reservation, including after uncertain shutdown.
 */
deliberate(agent: Agent, request: { key: string; sourceEventId: LifeEventId }, caller: AbortSignal): Promise<void>

/**
 * Offer one choice to speak or wait, reusing the existing bounded state and writer.
 * @param agent - Idle character conversation used for the audited inference.
 * @param key - Stable interaction opportunity key.
 * @param source - Actual life trigger.
 * @param signal - Owner cancellation.
 * @returns A committed decision; this method never enqueues task execution.
 */
considerInteraction(agent: Agent, key: string, source: LifeEventId, signal: AbortSignal): Promise<LifeDecision>

/**
 * Record only actual committed assistant/tool outcomes and clear live tool admission.
 * @param agent - Agent whose admitted execution is finishing.
 * @param interrupted - Whether failure, cancellation or disposal interrupted execution.
 * @returns After durable settlement; absence of an admission is a no-op.
 */
settle(agent: Agent, interrupted: boolean): Promise<void>

/**
 * Retain bounded result metadata delivered live; no historical Session reads or result bodies are needed.
 * @param sessionId - Actual event owner.
 * @param event - Committed Session event supplied by the integration.
 */
observe(sessionId: SessionId, event: SessionEvent): void

/** Cancel auxiliary inference and drain accepted reviews; core storage remains owned by the plugin.
 * @returns After all pending inference operations settle.
 */
async close(): Promise<void>
```

Types: [Agent](core.zh.md) · [LifeDecision](../genesis/motivation.zh.md) · [LifeEventId](../genesis/data-model.zh.md) · [SessionEvent](session.zh.md) · [SessionId](core.zh.md) · [UserMessage](session.zh.md)

Source: [`packages/experimental/genesis/src/deliberation.ts`](../../packages/experimental/genesis/src/deliberation.ts)

<a id="ctxgenesisinitiative--socialinitiative"></a>

### `ctx.genesisInitiative` — `SocialInitiative`

One serialized, cancelable owner; pending delivery never implies successful delivery.

```ts cordis-catalog
/** Initialize pending deliveries and schedule checks from the saved policy.
 * @returns After initialization, pending-receipt recovery and timer setup; startup creates no new opportunity. */
async start(): Promise<void>

/** Read the current delivery schedule and failure state.
 * @returns Current runtime evidence; configuration and receipts remain core-owned. */
status(): { working: boolean; nextCheckAt: string | null; failure: { code: string; message: string } | null }

/**
 * Give a timer or trusted life event exactly one speak-or-wait opportunity.
 * @param request - Stable deduplication key and actual life evidence.
 * @param signal - Optional caller cancellation; absent uses the plugin lifetime.
 * @returns Durable outcome, including pending when there is no usable channel.
 */
considerInteraction(request: { key: string; sourceEventId: LifeEventId }, signal?: AbortSignal): Promise<InteractionRecord>

/** One scheduled wake; the persisted bucket also deduplicates restarts within the interval.
 * @returns After event catch-up and one scheduled opportunity. */
tick(): Promise<void>

/**
 * Admit only an outstanding attributed notice, rechecking limits and giving real user input priority.
 * @param agent - Actual receiving conversation.
 * @param messages - Proposed next-step inputs.
 * @returns Inputs with any unsafe, canceled or already-settled initiative removed.
 */
async admit(agent: Agent, messages: UserMessage[]): Promise<UserMessage[]>

/**
 * Settle live or stored assistant receipts without waking cold Agents; only pending opportunities may dispatch.
 * @returns After receipt reconciliation and pending consideration; storage failures remain visible without resending.
 */
resume(): Promise<void>

/**
 * Consume committed Session evidence; enqueueing or whole-Agent idle alone never marks success.
 * @param session - Session whose projection has already folded the actual event.
 */
observe(session: Session): void

/** Stop proactive checks and drain accepted work.
 * @returns After timers stop and every accepted operation drains; queued notices require active plugin admission.
 */
async close(): Promise<void>
```

Types: [Agent](core.zh.md) · [LifeEventId](../genesis/data-model.zh.md) · [Session](session.zh.md) · [UserMessage](session.zh.md)

Source: [`packages/experimental/genesis/src/social.ts`](../../packages/experimental/genesis/src/social.ts)

<a id="ctxgenesisinitiativestatus--genesisinitiativegateway"></a>

### `ctx.genesisInitiativeStatus` — `GenesisInitiativeGateway`

Settings revisions are independent of background receipt commits.

```ts cordis-catalog
/**
 * Read settings, channel availability and bounded actual decisions and receipts.
 * @param signal - Caller cancellation.
 * @returns A complete bounded sample with truncation and omission counts; no delivery is implied by enqueueing.
 */
@Remote('inspect') inspect(signal: AbortSignal): Promise<InitiativeStatus>

/**
 * Save policy for subsequent opportunities and admission; previously admitted assistant turns may finish.
 * @param settings - Complete policy, validated at this wire boundary.
 * @param revision - Displayed settings revision.
 * @param signal - Caller cancellation; an admitted storage commit drains.
 * @returns Committed revision; failures preserve the operator draft.
 */
@Remote('saveSettings') saveSettings(settings: InitiativeSettings, revision: number, signal: AbortSignal): Promise<number>
```

Types: [InitiativeSettings](../genesis/social.zh.md) · [InitiativeStatus](../genesis/social.zh.md)

Source: [`packages/experimental/genesis/src/initiative-gateway.ts`](../../packages/experimental/genesis/src/initiative-gateway.ts)

<a id="ctxgenesismail--mailgateway"></a>

### `ctx.genesisMail` — `MailGateway`

Operator reads never mark mail as read by the character.

```ts cordis-catalog
/** Read metadata and independent attention states.
 * @param folder - Folder filter or all.
 * @param query - Literal search.
 * @param offset - Page position.
 * @param signal - Caller cancellation.
 * @returns Bounded current mailbox sample.
 */
@Remote('inspect') inspect(folder: string, query: string, offset: number, signal: AbortSignal): Promise<MailStatus>

/** Read retained text without changing character attention.
 * @param id - Exact local mail ID.
 * @param signal - Caller cancellation.
 * @returns Current message.
 */
@Remote('detail') detail(id: MailId, signal: AbortSignal): Promise<MailMessage>

/** Persist account and policy choices.
 * @param settings - Complete nonsecret draft.
 * @param revision - Displayed revision.
 * @param signal - Caller cancellation.
 * @returns Committed revision.
 */
@Remote('save') save(settings: MailSettings, revision: number, signal: AbortSignal): Promise<number>

/** Store/remove the account application password.
 * @param value - Password or undefined for removal.
 * @param revision - Displayed settings revision.
 * @param signal - Caller cancellation.
 * @returns After credential confirmation.
 */
@Remote('setPassword') setPassword(value: string | undefined, revision: number, signal: AbortSignal): Promise<void>

/** Fetch a bounded batch without waiting for model processing.
 * @param signal - Caller cancellation before admission.
 * @returns After sync; background processing is independently visible.
 */
@Remote('sync') sync(signal: AbortSignal): Promise<void>

/** Move mail locally; no remote deletion or character read is implied.
 * @param id - Exact mail ID.
 * @param action - Local folder operation.
 * @param signal - Caller cancellation.
 * @returns After durable organization.
 */
@Remote('organize') organize(id: MailId, action: 'archive' | 'trash' | 'restore', signal: AbortSignal): Promise<void>

/** Permanently remove a trashed local copy while retaining text-free deduplication.
 * @param id - Exact trashed message.
 * @param signal - Caller cancellation.
 * @returns After local deletion; server mail and Session logs remain separate.
 */
@Remote('erase') erase(id: MailId, signal: AbortSignal): Promise<void>
```

Source: [`packages/experimental/genesis-mail/src/gateway.ts`](../../packages/experimental/genesis-mail/src/gateway.ts)

<a id="ctxgenesismemory--genesismemorygateway"></a>

### `ctx.genesisMemory` — `GenesisMemoryGateway`

Explicit user memory controls; errors retain their actual stage and safe diagnostic.

```ts cordis-catalog
/**
 * Generate selected-layer memories for one durable reply without running the decision model.
 * @param sessionId - Open conversation owning the reply.
 * @param messageId - Completed assistant message.
 * @param kind - Operator-selected memory layer.
 * @param signal - Caller cancellation; storage commits already admitted drain.
 * @returns Whether changes were saved; repeated requests are idempotent.
 */
@Remote({ name: 'generate', resources: { session: (sessionId: SessionId) => sessionId } }) generate(sessionId: SessionId, messageId: MessageId, kind: MemoryKind, signal: AbortSignal): Promise<boolean>

/**
 * Let the independent writer organize all chat text and memories associated with one open Life conversation.
 * @param sessionId - Authorized source conversation; tool and injected output are excluded.
 * @param id - Stable operator request UUID, retained across failed or uncertain retries.
 * @param signal - Caller cancellation; admitted storage writes drain.
 * @returns Whether valid entries changed memories after version checks; invalid entries are logged and deletions withheld; repeated committed requests are idempotent.
 */
@Remote({ name: 'overview', resources: { session: (sessionId: SessionId) => sessionId } }) overview(sessionId: SessionId, id: MemoryOrganizationId, signal: AbortSignal): Promise<boolean>

/**
 * Create a sourced operator candidate or directly update its current fields without an edit event or revision.
 * @param id - Client-allocated memory UUID, retained across retries.
 * @param draft - Editable fields; attribution and sources are assigned by the core.
 * @param updatedAt - Displayed version, or null when creating.
 * @param signal - Cancellation before storage admission.
 * @returns Accepted memory without its vector cache.
 */
@Remote('save') save(id: MemoryId, draft: MemoryDraft, updatedAt: string | null, signal: AbortSignal): Promise<LifeMemory>

/**
 * Save or remove a short description without changing memory content, attribution or habit evidence.
 * @param id - Existing memory identifier.
 * @param summary - At most forty characters, or null to remove the description.
 * @param updatedAt - Displayed memory version.
 * @param signal - Cancellation before storage admission.
 * @returns Accepted memory without vector caches; stale edits are refused.
 */
@Remote('saveSummary') saveSummary(id: MemoryId, summary: string | null, updatedAt: string, signal: AbortSignal): Promise<LifeMemory>

/**
 * Generate a short description from the current memory through the saved independent writer.
 * @param id - Existing memory identifier.
 * @param updatedAt - Displayed version, checked again after inference.
 * @param signal - Caller cancellation; retries retain the original deadline.
 * @returns Memory with its new summary; failure leaves the selected version unchanged.
 */
@Remote('summarize') summarize(id: MemoryId, updatedAt: string, signal: AbortSignal): Promise<LifeMemory>

/**
 * Delete current memory content after checking the displayed version, without adding an edit event.
 * @param id - Memory to remove.
 * @param updatedAt - Displayed version; stale deletion is refused.
 * @param signal - Cancellation before storage admission.
 * @returns Whether the memory existed and was deleted.
 */
@Remote('deleteMemory') deleteMemory(id: MemoryId, updatedAt: string, signal: AbortSignal): Promise<boolean>

/**
 * Enable or disable automatic idle consolidation without dropping queued evidence.
 * @param enabled - Operator preference, shared across modes and restarts.
 * @param signal - Cancellation before storage admission.
 * @returns After the preference commits and scheduling is reconsidered.
 */
@Remote('setConsolidation') setConsolidation(enabled: boolean, signal: AbortSignal): Promise<void>

/**
 * Run one explicit consolidation pass using the saved writer and embedding configuration.
 * @param signal - Operator cancellation; a conversation also cancels pending inference.
 * @returns Whether the pending revision committed; failures retain their specific stage and cause.
 */
@Remote('consolidate') consolidate(signal: AbortSignal): Promise<boolean>

/**
 * Integrate explicitly selected memory versions into one or several new candidates.
 * @param request - Stable retry identity, selected versions and optional exact result count.
 * @param signal - Operator cancellation; admitted primary writes drain.
 * @returns Sourced results without vectors, atomically replacing the selection. Inference failures retain originals; storage or cleanup failures require checking the stable request on retry.
 */
@Remote('organize') organize(request: MemoryOrganizationRequest, signal: AbortSignal): Promise<LifeMemory[]>

/**
 * Save explicit operator identity and replace legacy generic role references without changing facts.
 * @param profile - Human-authored operator name and identity.
 * @param revision - Displayed identity revision.
 * @param signal - Caller cancellation; admitted primary writes drain.
 * @returns New revision after identity and all accepted wording replacements commit together.
 */
@Remote('saveOperator') saveOperator(profile: OperatorIdentity, revision: number, signal: AbortSignal): Promise<number>

/**
 * Convert one existing memory between declarative and non-declarative storage.
 * @param id - Existing sourced memory.
 * @param kind - Desired layer; content and sources stay fixed.
 * @param updatedAt - Displayed memory version.
 * @param signal - Caller cancellation before storage admission.
 * @returns Committed memory without its embedding cache.
 */
@Remote('convert') convert(id: MemoryId, kind: MemoryKind, updatedAt: string, signal: AbortSignal): Promise<LifeMemory>
```

Types: [LifeMemory](../genesis/data-model.zh.md) · [MemoryDraft](../genesis/memory.zh.md) · [MemoryId](../genesis/data-model.zh.md) · [MemoryKind](../genesis/memory.zh.md) · [MemoryOrganizationId](../genesis/memory.zh.md) · [MemoryOrganizationRequest](../genesis/memory.zh.md) · [MessageId](llm-streaming.zh.md) · [OperatorIdentity](../genesis/memory.zh.md) · [SessionId](core.zh.md)

Source: [`packages/experimental/genesis/src/memory-gateway.ts`](../../packages/experimental/genesis/src/memory-gateway.ts)

<a id="ctxgenesismessaging--lifemessagerouter"></a>

### `ctx.genesisMessaging` — `LifeMessageRouter`

Shared provider registration and authorization; QQ retains its scoped transport consumer.

```ts cordis-catalog
/** Register one optional destination owner.
 * @param provider - Provider retained until its caller disposes the returned registration.
 * @returns Exact reversible registration.
 */
register(provider: MessageProvider): () => void

/** List additional destinations for an authenticated source; no sending side effect.
 * @param agent - Current initiating Life Agent.
 * @param signal - Caller cancellation.
 * @returns Current provider-owned destinations; empty when no optional provider is loaded.
 */
async targets(agent: Agent, signal: AbortSignal): Promise<MessageTarget[]>

/** Route an extension action; undefined delegates to the caller's existing QQ implementation.
 * @param input - Raw tool JSON, validated here before dispatch.
 * @param invocation - Actual source and logged call identity.
 * @returns Provider receipt, or undefined when no extension owns the action.
 */
async route(input: unknown, invocation: MessageInvocation): Promise<MessageResult | undefined>
```

Types: [Agent](core.zh.md)

Source: [`packages/experimental/genesis/src/message-routing.ts`](../../packages/experimental/genesis/src/message-routing.ts)

<a id="ctxgenesisminecraft--minecraftgateway"></a>

### `ctx.genesisMinecraft` — `MinecraftGateway`

Operator access does not teach or enable any model tool.

```ts cordis-catalog
/**
 * Read settings and sampled status without a connection side effect.
 * @param signal - Caller cancellation.
 * @returns Current nonsecret status.
 */
@Remote('inspect') inspect(signal: AbortSignal): Promise<MinecraftStatus>

/**
 * Persist settings, stopping the existing game before changes.
 * @param settings - Complete operator draft.
 * @param revision - Displayed revision.
 * @param signal - Caller cancellation before admission.
 * @returns Committed revision.
 */
@Remote('save') save(settings: MinecraftSettings, revision: number, signal: AbortSignal): Promise<number>

/**
 * Connect with explicit server choices in a connection-owned Life conversation.
 * @param connection - Server, offline player name and protocol selection.
 * @param signal - Cancels setup.
 * @returns After real spawn and camera readiness.
 */
@Remote('connect') connect(connection: MinecraftConnection, signal: AbortSignal): Promise<void>

/**
 * Stop skills immediately without waiting for Jev or a chat response.
 * @param signal - Caller cancellation before admission.
 * @returns After controls are cleared.
 */
@Remote('stop') stop(signal: AbortSignal): Promise<void>

/**
 * Disconnect without automatic reconnection.
 * @param signal - Caller cancellation before admission.
 * @returns After all game resources close.
 */
@Remote('disconnect') disconnect(signal: AbortSignal): Promise<void>

/**
 * Stream bounded sampled status while this settings resource is open.
 * @param signal - Ends the subscription.
 * @returns Current snapshots; cancellation creates no additional work.
 */
@Remote({ mode: 'stream' }) async *watch(signal: AbortSignal): AsyncIterable<MinecraftStatus>
```

Source: [`packages/experimental/genesis-minecraft/src/gateway.ts`](../../packages/experimental/genesis-minecraft/src/gateway.ts)

<a id="ctxgenesispeople--genesispeoplegateway"></a>

### `ctx.genesisPeople` — `GenesisPeopleGateway`

Operator-only, paged relationship inspection and explicit retention deletion.

```ts cordis-catalog
/**
 * List current retained profiles in stable ID order without creating profiles for strangers.
 * @param offset - Zero-based page offset.
 * @param signal - Caller cancellation before admission.
 * @returns One bounded page, total count and continuation offset.
 */
@Remote('inspect') inspect(offset: number, signal: AbortSignal): Promise<PeopleCatalog>

/**
 * Read relationship appraisals with links to their actual source Sessions.
 * @param id - Stable person identity selected from the catalogue.
 * @param offset - Evidence page offset, newest first.
 * @param signal - Caller cancellation before admission.
 * @returns Current profile and a bounded evidence page; missing profiles fail visibly.
 */
@Remote('detail') detail(id: PersonId, offset: number, signal: AbortSignal): Promise<PersonDetail>

/**
 * Remove a displayed relationship and its dependent memories without deleting original Session audits.
 * @param id - Explicit operator-selected stable identity.
 * @param updatedAt - Displayed profile version; concurrent changes refuse deletion.
 * @param signal - Caller cancellation before admission; accepted writes drain on teardown.
 * @returns After the retained profile and dependent memories are durably removed.
 */
@Remote('forget') forget(id: PersonId, updatedAt: string, signal: AbortSignal): Promise<void>
```

Types: [PersonId](../genesis/data-model.zh.md)

Source: [`packages/experimental/genesis/src/people-gateway.ts`](../../packages/experimental/genesis/src/people-gateway.ts)

<a id="ctxgenesisqq--qqcontroller"></a>

### `ctx.genesisQq` — `QqController`

Settings remain available when OneBot is absent or its listener cannot start.

```ts cordis-catalog
/** Attach the optional life-wide sleep owner across transport replacements.
 * @param sleep - Current owner; undefined detaches its callbacks.
 */
setSleep(sleep: LifeSleep | undefined): void

/**
 * Restore saved choices without preventing the settings page from reporting transport failure.
 * @returns After setup settles.
 */
async start(): Promise<void>

/**
 * Save choices and reconnect; a failed reconnect remains visible and can be retried by saving again.
 * @param connection - Complete nonsecret choices.
 * @param revision - Displayed connection revision.
 * @returns Committed revision.
 */
saveConnection(connection: QqConnection, revision: number): Promise<number>

/**
 * Store or remove the channel token, stopping the old connection before touching credentials.
 * @param value - New token, or undefined to remove it.
 * @returns After credential persistence and optional reconnection.
 */
setToken(value: string | undefined): Promise<void>

/**
 * Inspect without connecting or exposing secrets.
 * @returns Current nonsecret connection and bounded receipt sample.
 */
async inspect(): Promise<QqStatus>

/**
 * Save QQ-only inference choices.
 * @param settings - Operator route.
 * @param revision - Revision fence.
 * @returns New revision.
 */
saveDecision(settings: QqDecisionSettings, revision: number): Promise<number>

/**
 * Store a dedicated key without modifying memory credentials.
 * @param value - Secret or removal.
 * @returns After provider confirmation.
 */
setDecisionKey(value: string | undefined): Promise<void>

/**
 * Return the current listener address.
 * @returns Null while disabled or disconnected.
 */
address(): { address: string; port: number } | string | null

/**
 * Forward committed replies only to the current transport.
 * @param sessionId - Session owner.
 * @param event - Committed Session event.
 */
observe(sessionId: SessionId, event: SessionEvent): void

/**
 * Stop admission and drain reconfiguration before disposing transport.
 * @returns After all channel work closes.
 */
close(): Promise<void>
```

Types: [LifeSleep](../genesis/sleep.zh.md) · [SessionEvent](session.zh.md) · [SessionId](core.zh.md)

Source: [`packages/experimental/genesis-qq/src/controller.ts`](../../packages/experimental/genesis-qq/src/controller.ts)

<a id="ctxgenesisqqsettings--qqgateway"></a>

### `ctx.genesisQqSettings` — `QqGateway`

Only operator policy can change admission; inspecting receipts has no external send side effect.

```ts cordis-catalog
/**
 * Read secret-free connection and delivery diagnostics.
 * @param signal - Caller cancellation.
 * @returns Current bounded sample.
 */
@Remote('inspect') inspect(signal: AbortSignal): Promise<QqStatus>

/**
 * Persist nonsecret connection choices and replace the old transport.
 * @param connection - Complete operator choices.
 * @param revision - Displayed connection revision.
 * @param signal - Cancellation before admission.
 * @returns Committed connection revision.
 */
@Remote('saveConnection') saveConnection(connection: QqConnection, revision: number, signal: AbortSignal): Promise<number>

/**
 * Save or remove the OneBot token through credential storage; no token is returned.
 * @param value - Token or undefined for removal.
 * @param signal - Cancellation before admission.
 * @returns After credential persistence.
 */
@Remote('setToken') setToken(value: string | undefined, signal: AbortSignal): Promise<void>

/**
 * Save an independent QQ decision route.
 * @param settings - Nonsecret route.
 * @param revision - Revision fence.
 * @param signal - Cancellation.
 * @returns Committed revision.
 */
@Remote('saveDecision') saveDecision(settings: QqDecisionSettings, revision: number, signal: AbortSignal): Promise<number>

/**
 * Save/remove the QQ decision credential.
 * @param value - Secret or removal.
 * @param signal - Cancellation.
 * @returns After credential confirmation.
 */
@Remote('setDecisionKey') setDecisionKey(value: string | undefined, signal: AbortSignal): Promise<void>

/**
 * Save route policy independently of connection settings.
 * @param settings - Complete operator admission policy.
 * @param revision - Last displayed revision.
 * @param signal - Caller cancellation before admission; admitted writes drain on teardown.
 * @returns Committed revision; the next queued operation checks the new policy.
 */
@Remote('save') save(settings: QqSettings, revision: number, signal: AbortSignal): Promise<number>
```

Source: [`packages/experimental/genesis-qq/src/gateway.ts`](../../packages/experimental/genesis-qq/src/gateway.ts)

<a id="ctxgenesisrecords--genesisrecordsgateway"></a>

### `ctx.genesisRecords` — `GenesisRecordsGateway`

Operator API; disabling recording keeps the namespace mounted with an explicit unavailable catalog.

```ts cordis-catalog
/**
 * Initialize a trusted integration category; this is not exposed to Remote callers or model tools.
 * @param id - Stable integration category identity.
 * @param name - Initial label, never overwriting operator changes.
 * @param signal - Caller cancellation.
 * @returns Existing or created category; disabled recording rejects.
 */
ensureType(id: WritingTypeId, name: string, signal: AbortSignal): Promise<WritingType>

/**
 * Import a legacy writing without changing life memory or exposing arbitrary import keys to the model.
 * @param draft - Complete attributed text and current category.
 * @param source - Actual Session and tool call performing migration.
 * @param imported - Adapter-owned permanent receipt and validated original creation time.
 * @param signal - Cancellation before durable admission; accepted writes drain.
 * @returns Stable receipt; retries preserve operator edits and never recreate deleted records.
 */
importRecord(draft: WritingDraft, source: { sessionId: SessionId; callId: ToolCallId }, imported: { id: WritingImportId; createdAt: string }, signal: AbortSignal): Promise<WritingReceipt>

/**
 * Read record categories and effective writing limits.
 * @param signal - Caller cancellation.
 * @returns Categories and limits, or null when recording is disabled.
 */
@Remote('catalog') catalog(signal: AbortSignal): Promise<WritingCatalog | null>

/**
 * Search writing titles and content without model calls.
 * @param query - Bounded substring, type and time filters.
 * @param signal - Caller cancellation.
 * @returns Matching records with snippets and continuation offset.
 */
@Remote('search') search(query: WritingQuery, signal: AbortSignal): Promise<WritingSearch>

/**
 * Read one revision in bounded text chunks.
 * @param id - Stable record id.
 * @param offset - Returned continuation position, initially zero.
 * @param signal - Caller cancellation.
 * @returns One bounded text chunk and original attribution.
 */
@Remote('read') read(id: WritingId, offset: number, signal: AbortSignal): Promise<WritingRead>

/**
 * Replace current fields while retaining original creation attribution.
 * @param id - Record to edit.
 * @param draft - Operator replacement text and type.
 * @param revision - Displayed revision.
 * @param signal - Cancellation before commit admission.
 * @returns New revision; rejected edits retain the caller’s draft.
 */
@Remote('edit') edit(id: WritingId, draft: WritingDraft, revision: number, signal: AbortSignal): Promise<number>

/**
 * Erase current writing text and its generated Markdown file.
 * @param id - Record to delete.
 * @param revision - Displayed revision.
 * @param signal - Cancellation before admission.
 * @returns After current text and generated file removal; Session history is independent.
 */
@Remote('deleteRecord') deleteRecord(id: WritingId, revision: number, signal: AbortSignal): Promise<void>

/**
 * Create or update an operator-managed writing category.
 * @param id - Existing type id or null for a new system-generated id.
 * @param name - Display name.
 * @param enabled - Permit new writes.
 * @param revision - Displayed type revision, zero for creation.
 * @param signal - Cancellation before admission.
 * @returns Saved type without relocating records on rename.
 */
@Remote('saveType') saveType(id: WritingTypeId | null, name: string, enabled: boolean, revision: number, signal: AbortSignal): Promise<WritingType>
```

Types: [SessionId](core.zh.md) · [ToolCallId](core.zh.md) · [WritingCatalog](../genesis/records.zh.md) · [WritingDraft](../genesis/records.zh.md) · [WritingId](../genesis/records.zh.md) · [WritingImportId](../genesis/records.zh.md) · [WritingQuery](../genesis/records.zh.md) · [WritingRead](../genesis/records.zh.md) · [WritingReceipt](../genesis/records.zh.md) · [WritingSearch](../genesis/records.zh.md) · [WritingType](../genesis/records.zh.md) · [WritingTypeId](../genesis/records.zh.md)

Source: [`packages/experimental/genesis/src/records-gateway.ts`](../../packages/experimental/genesis/src/records-gateway.ts)

<a id="ctxgenesisrhythm--genesisrhythmgateway"></a>

### `ctx.genesisRhythm` — `GenesisRhythmGateway`

Transport exposes owner operations without impersonating a Life tool call.

```ts cordis-catalog
/** Read policies, thoughts, actual sleep times and maintenance progress.
 *
 * @param signal - Caller cancellation.
 *
 * @returns Bounded independent feature samples.
 */
@Remote('inspect') inspect(signal: AbortSignal): Promise<RhythmStatus>

/** Save the complete sleep schedule.
 *
 * @param settings - Validated owner draft.
 *
 * @param revision - Displayed revision.
 *
 * @param signal - Cancellation before admission.
 *
 * @returns Committed settings revision.
 */
@Remote('saveSleep') saveSleep(settings: SleepSettings, revision: number, signal: AbortSignal): Promise<number>

/** Apply an explicit wake control without a model decision.
 *
 * @param kind - Temporary wake or wake until the next scheduled interval.
 *
 * @param signal - Cancellation before admission.
 *
 * @returns After durable wake state commits.
 */
@Remote('wake') wake(kind: 'temporary' | 'keep-awake', signal: AbortSignal): Promise<void>

/** Save private cognition controls.
 *
 * @param settings - Complete owner draft.
 *
 * @param revision - Displayed settings revision.
 *
 * @param signal - Cancellation before admission.
 *
 * @returns Committed revision.
 */
@Remote('saveSpontaneity') saveSpontaneity(settings: SpontaneitySettings, revision: number, signal: AbortSignal): Promise<number>

/** Stop an active private exploration without deleting confirmed progress.
 *
 * @param signal - Caller cancellation.
 *
 * @returns After the stop request is admitted; the receipt reports final settlement.
 */
@Remote('stop') stop(signal: AbortSignal): Promise<void>

/** Retry a failed sleeping-memory batch from its retained cursor.
 *
 * @param id - Displayed cycle identity.
 *
 * @param signal - Cancellation before admission.
 *
 * @returns After retry admission.
 */
@Remote('retry') retry(id: string, signal: AbortSignal): Promise<void>
```

Types: [RhythmStatus](../genesis/sleep.zh.md) · [SleepSettings](../genesis/sleep.zh.md) · [SpontaneitySettings](../genesis/spontaneity.zh.md)

Source: [`packages/experimental/genesis/src/rhythm-gateway.ts`](../../packages/experimental/genesis/src/rhythm-gateway.ts)

<a id="ctxgenesissleep--lifesleep"></a>

### `ctx.genesisSleep` — `LifeSleep`

Own one serialized state machine and a separately cancelable maintenance interval.

```ts cordis-catalog
/** Register an adapter-owned backlog sample without moving channel data into life memory.
 *
 * @param read - Confirmed queue counts.
 *
 * @returns Exact disposer.
 */
registerBacklog(read: () => { pending: number; uncertain: number }): () => void

/** Identify an admitted tool-free sleep maintenance call.
 *
 * @param sessionId - Actual audit Session.
 *
 * @returns Whether this owner currently owns its maintenance inference.
 */
ownsMaintenance(sessionId: SessionId): boolean

/** Current autonomous permission, independent of willingness and tool authorization.
 *
 * @returns True only during normal or explicitly maintained wakefulness.
 */
autonomousAllowed(): boolean

/** Whether a given speaker can converse now.
 *
 * @param operator - Transport-verified operator identity.
 *
 * @returns Temporary wakefulness admits only the operator; sleep admits no ordinary dialogue.
 */
conversationAllowed(operator: boolean): boolean

/**
 * Identify the verified speaker admitted to this active turn.
 *
 * @param agent - Current Life Agent.
 *
 * @returns Whether its admitted human input belongs to the operator.
 */
operatorTurn(agent: Agent): boolean

/** Read a bounded status without model inference.
 *
 * @returns Current sampled schedule, calendar coverage and maintenance failures.
 */
inspect(): SleepStatus

/** Subscribe to committed transitions; disposal belongs to the caller.
 *
 * @param listener - Nonthrowing adapter callback.
 *
 * @returns Exact unsubscribe operation.
 */
onTransition(listener: (event: SleepTransition) => void): () => void

/** Apply absolute schedule and temporary deadlines once; startup never invents missed transitions.
 *
 * @param now - Actual instant, defaulting to the current clock.
 *
 * @returns After any committed transition and its source snapshot.
 */
tick(now: number = Date.now()): Promise<void>

/** Change complete settings with optimistic concurrency.
 *
 * @param settings - Operator policy.
 *
 * @param revision - Last displayed settings revision.
 *
 * @returns Committed revision; the current schedule is reconciled immediately.
 */
save(settings: SleepSettings, revision: number): Promise<number>

/** Explicit operator control; no binary decision is made.
 *
 * @param kind - Temporary wake or wake until the next interval.
 *
 * @returns After the control and its source event commit.
 */
wake(kind: 'temporary' | 'keep-awake'): Promise<void>

/** Admit real operator commands or classify natural wake language only while asleep.
 *
 * @param agent - Actual inference audit Session owner.
 *
 * @param text - Original unquoted transport text.
 *
 * @param key - Stable transport message identity.
 *
 * @param operator - Verified identity, never derived from text.
 *
 * @param signal - Caller cancellation.
 *
 * @returns Whether ordinary dialogue is currently admitted.
 */
async input(agent: Agent, text: string, key: string, operator: boolean, signal: AbortSignal): Promise<boolean>

/** Reserve a transition greeting once per target and scheduled boundary.
 *
 * @param event - Genuine committed transition.
 *
 * @param target - Adapter-resolved authorized private recipient.
 *
 * @returns Whether one new opportunity was reserved; replay and temporary wakes never send again.
 */
reserveGreeting(event: SleepTransition, target: PersonId | 'operator'): Promise<boolean>

/** Generate at most one optional, sourced transition greeting for an authorized adapter target.
 *
 * @param session - Actual recipient audit Session.
 *
 * @param event - Committed sleep transition.
 *
 * @param personId - Verified recipient identity, not a model-selected account.
 *
 * @param signal - Transport lifetime cancellation.
 *
 * @returns Chosen text, or null when affinity, policy or willingness does not support sending.
 */
async greeting(session: Session, event: SleepTransition, personId: PersonId | 'operator', signal: AbortSignal): Promise<string | null>

/** Confirm the actual platform outcome; uncertain sends are never automatically repeated.
 *
 * @param event - Reserved transition.
 *
 * @param personId - Verified recipient.
 *
 * @param outcome - Transport-observed result.
 *
 * @returns After the life receipt and local journal commit.
 */
async finishGreeting(event: SleepTransition, personId: PersonId | 'operator', outcome: 'sent' | 'skipped' | 'uncertain'): Promise<void>

/** Retry one failed cycle without changing its already committed batch progress.
 *
 * @param id - Displayed cycle id.
 *
 * @returns After retry admission; model work runs only while asleep.
 */
retry(id: string): Promise<void>

/** Install reversible admission checks and one schedule timer. */
install(): void

/** Stop scheduling, inference and admitted state work before storage closes.
 *
 * @returns After owned work and accepted writes settle.
 */
async close(): Promise<void>
```

Types: [Agent](core.zh.md) · [PersonId](../genesis/data-model.zh.md) · [Session](session.zh.md) · [SessionId](core.zh.md) · [SleepSettings](../genesis/sleep.zh.md) · [SleepStatus](../genesis/sleep.zh.md) · [SleepTransition](../genesis/sleep.zh.md)

Source: [`packages/experimental/genesis/src/sleep.ts`](../../packages/experimental/genesis/src/sleep.ts)

<a id="ctxgenesisspontaneity--spontaneity"></a>

### `ctx.genesisSpontaneity` — `Spontaneity`

One cancelable opportunity at a time; interrupted runs never auto-resume.

```ts cordis-catalog
/** Save operator cognition budgets; disabling immediately interrupts owned work.
 *
 * @param settings - Complete operator draft.
 *
 * @param revision - Displayed settings revision.
 *
 * @returns Committed revision.
 */
async configure(settings: SpontaneitySettings, revision: number): Promise<number>

/** Read actual exploration activity; reflection alone does not satisfy engagement.
 * @returns Whether a selected private activity is running.
 */
isExploring(): boolean

/** Register an optional transport with an explicit autonomous destination policy.
 * @param provider - Runtime-owned directory and durable sender.
 * @returns Lifecycle-owned removal; duplicate names fail visibly.
 */
registerConversation(provider: IdleConversationProvider): () => void

/** Verify a live social operation separately from its persisted Session marker.
 * @param agent - Exact runtime instance.
 * @returns Whether the internal reflection currently owns social admission.
 */
admitsSocial(agent: Agent): boolean

/** Stop the current opportunity while retaining its confirmed progress. */
stop(): void

/**
 * Limit private reflection declarations to its current bounded phase.
 * @param agent - Conversation whose declarations are being rendered.
 * @param name - Actual registered capability name.
 * @returns Whether reflection permits advertising this capability.
 */
advertises(agent: Agent, name: string): boolean

/** Check the live owner separately from durable Session attribution.
 *
 * @param agent - Exact runtime instance.
 *
 * @returns Whether this owner currently admits its work.
 */
admits(agent: Agent): boolean

/** Read bounded operator status without waking an Agent.
 *
 * @returns Current policy, counts, recent runs and failure. */
inspect(): SpontaneityStatus

/** Reserve worst-case output before a model attempt; unused reservation is not refunded.
 *
 * @param session - Actual inference audit Session.
 *
 * @param tokens - Requested output cap.
 *
 * @returns Unchanged cap for ordinary Sessions, or the reserved internal cap; exhaustion rejects before inference.
 */
reserveOutput(session: Session, tokens: number): number

/** Register audited tools, tool guards, quiet-period scheduling and cancellation. */
install(): void

/** Admit one idle opportunity from actual user evidence; no timer is installed by this method.
 *
 * @param sourceAgent - Live operator Life channel; its permission ceiling is retained.
 * @param boredom - Whether the recurring idle scheduler requested this opportunity.
 *
 * @returns After the complete owned interval, result settlement and Agent disposal; repeated sources do not dispatch again.
 */
consider(sourceAgent: Agent, boredom: boolean = false): Promise<void>

/** Stop timers and drain the complete owned work interval before storage closes.
 *
 * @returns After quiescence. */
async close(): Promise<void>
```

Types: [Agent](core.zh.md) · [Session](session.zh.md) · [SpontaneitySettings](../genesis/spontaneity.zh.md) · [SpontaneityStatus](../genesis/spontaneity.zh.md)

Source: [`packages/experimental/genesis/src/spontaneity.ts`](../../packages/experimental/genesis/src/spontaneity.ts)

<a id="ctxgenesisstatus--genesisstatusgateway"></a>

### `ctx.genesisStatus` — `GenesisStatusGateway`

Sample shared life state and initialize its name without changing its identity or permissions.

```ts cordis-catalog
/** Read the current auxiliary decision route without constructing a full status response.
 * @returns Detached operator route.
 */
decisionModel(): MemoryModelsSettings['decision']

/**
 * Evaluate a binary question through the configured decision route with durable request/response audit.
 * @param session - Actual caller's inference log.
 * @param question - Trusted binary question; generative routes receive explicit JSON output instructions.
 * @param input - Complete bounded evidence with explicitly scoped participants.
 * @param criteria - Trusted yes/no interpretations for binary endpoints.
 * @param signal - Caller cancellation; the shared auxiliary deadline also applies.
 * @param route - Optional channel-only decision route; shared settings remain unchanged.
 * @returns Validated answer and genuine endpoint probability when supplied; failure authorizes no action.
 */
async decide(session: Session, question: string, input: Record<string, unknown> & { participants: object }, criteria: { true: string; false: string }, signal: AbortSignal, route?: MemoryModelsSettings['decision']): Promise<{ update: boolean; decision?: { probability: number; threshold: number } | undefined }>

/**
 * Check configured chat/reviewer/writer routes and any enabled embedding service, then name this existing life once.
 * Credentials use the existing provider settings or account sign-in; no secrets are accepted or stored here.
 * @param name - User-chosen name, retained across Sessions and restarts.
 * @param signal - Caller cancellation; an admitted storage commit may still finish after cancellation.
 * @returns After naming commits; errors leave initialization pending unless a storage write has uncertain outcome.
 */
@Remote('initialize') async initialize(name: string, signal: AbortSignal): Promise<void>

/**
 * Persist independent memory routes without credentials or profile-overlay precedence.
 * @param settings - Decision and writer routes.
 * @param revision - Displayed revision; stale changes are refused.
 * @param signal - Caller cancellation; admitted writes still drain.
 * @returns Committed revision.
 */
@Remote('saveModels') async saveModels(settings: MemoryModelsSettings, revision: number, signal: AbortSignal): Promise<number>

/**
 * Install and verify the optional local decision model before selecting it.
 * @param revision - Last displayed model revision; concurrent edits refuse route publication.
 * @param signal - Operator cancellation during download and verification.
 * @returns New settings revision; failed installation preserves the previous selection.
 */
@Remote('deployLocalDecision') async deployLocalDecision(revision: number, signal: AbortSignal): Promise<number>

/**
 * Disable the managed route before stopping or removing its private runtime.
 * @param revision - Last displayed settings revision.
 * @param remove - True also removes downloaded assets; cloud configuration and life data are retained.
 * @param signal - Operator cancellation before admission.
 * @returns New revision after route selection commits and teardown finishes.
 */
@Remote('stopLocalDecision') async stopLocalDecision(revision: number, remove: boolean, signal: AbortSignal): Promise<number>

/**
 * Check a saved provider route, or authenticate against an endpoint's model catalog without sending conversation data.
 * @param role - Independent decision or writer configuration to check.
 * @param signal - Caller cancellation; the memory timeout bounds network work.
 * @returns After provider preparation or a valid model catalog containing the selected model.
 */
@Remote('testModel') async testModel(role: 'decision' | 'writer', signal: AbortSignal): Promise<void>

/**
 * Start the logged built-in awakening in an existing blank life-mode Session, once per life.
 * @param sessionId - Session created through the supported Web Session API.
 * @param language - UI language used only for the first greeting.
 * @param signal - Caller cancellation before admission; queued work belongs to the Agent thereafter.
 * @returns Canonical first Session, including when another browser already started it.
 */
@Remote('greet') async greet(sessionId: SessionId, language: 'en' | 'zh', signal: AbortSignal): Promise<SessionId>

/**
 * Save complete operator emotion rules without changing life identity or permissions.
 * @param settings - JSON-validated enabled state, appraisal bounds and recovery parameters.
 * @param revision - Last displayed emotion revision; stale drafts are rejected.
 * @param signal - Caller cancellation; admitted writes still drain.
 * @returns Committed revision; refresh status before making a subsequent edit.
 */
@Remote('saveEmotionSettings') async saveEmotionSettings(settings: EmotionSettings, revision: number, signal: AbortSignal): Promise<number>

/**
 * Apply an explicit operator adjustment, recorded separately from model appraisals.
 * @param adjustment - Absolute intensities and the operator's reason.
 * @param revision - Last displayed revision; stale drafts cannot overwrite newer state.
 * @param signal - Caller cancellation; accepted writes complete before disposal.
 * @returns Committed revision; the next logged request context reflects this adjustment.
 */
@Remote('adjustEmotion') async adjustEmotion(adjustment: EmotionAdjustment, revision: number, signal: AbortSignal): Promise<number>

/**
 * Adjust the persistent single-operator relationship without creating conversation evidence.
 * @param adjustment - Absolute values, display label and operator reason.
 * @param revision - Last sampled emotion revision; stale edits are refused.
 * @param signal - Caller cancellation; accepted atomic writes drain.
 * @returns Committed revision; refresh the shared status after saving.
 */
@Remote('adjustRelationship') async adjustRelationship(adjustment: RelationshipAdjustment, revision: number, signal: AbortSignal): Promise<number>

/**
 * Retry the latest failed review while its live evidence remains available.
 * @param sessionId - Conversation that owns the failed review.
 * @param signal - Caller cancellation; no new chat reply is generated.
 * @returns After the retry settles; restart or newer-turn evidence requires a new conversation turn.
 */
@Remote('retryMemory') async retryMemory(sessionId: SessionId, signal: AbortSignal): Promise<void>

/**
 * Save nonsecret embedding preferences independently of command-line profile overlays.
 * @param settings - Validated endpoint, model, dimensions and optional credential reference.
 * @param revision - Revision from the displayed status sample.
 * @param signal - Caller cancellation; an admitted write drains even if cancelled later.
 * @returns The committed revision, after durable storage has accepted the update.
 */
@Remote('saveEmbedding') async saveEmbedding(settings: EmbeddingSettings, revision: number, signal: AbortSignal): Promise<number>

/**
 * Probe the saved embedding configuration without changing identity or memories.
 * @param signal - Caller cancellation; the configured memory deadline bounds the request.
 * @returns After one response with the expected vector dimensions has been verified.
 */
@Remote('testEmbedding') async testEmbedding(signal: AbortSignal): Promise<void>

/**
 * Read personality and expression memories independently of unrelated memory previews.
 * @param signal - Caller cancellation before the bounded read.
 * @returns Current behavioral records and an explicit count of omitted matches, without vector caches.
 */
@Remote('personality') personality(signal: AbortSignal): Promise<PersonalityStatus>

/**
 * Search stored memories by relevance, or browse newest first, without an embedding request.
 * @param query - Multilingual keywords, partial names or an exact memory ID; blank text lists every memory.
 * @param kind - Layer filter; `all` includes both layers.
 * @param offset - Zero-based page offset within the filtered ranking.
 * @param signal - Caller cancellation.
 * @returns One bounded page, its filtered total and the continuation offset; vectors are excluded.
 */
@Remote('memories') async memories(query: string, kind: MemoryKind | 'all', offset: number, signal: AbortSignal): Promise<MemoryCatalog>

/**
 * Sample live tools, identity, counts and bounded memory/growth previews.
 * Historical scopes are excluded from current availability. Errors reject;
 * callers keep their previous sample visibly stale and offer retry.
 * @param signal - Caller cancellation; already-started life writes retain their durability semantics.
 * @returns A bounded detached status sample with explicit omission counts.
 */
@Remote('inspect') async inspect(signal: AbortSignal): Promise<LifeStatus>
```

Types: [EmbeddingSettings](../genesis/memory.zh.md) · [LifeStatus](../genesis/data-model.zh.md) · [MemoryCatalog](../genesis/memory.zh.md) · [MemoryKind](../genesis/memory.zh.md) · [MemoryModelsSettings](../genesis/memory.zh.md) · [PersonalityStatus](../genesis/memory.zh.md) · [Session](session.zh.md) · [SessionId](core.zh.md)

Source: [`packages/experimental/genesis/src/status.ts`](../../packages/experimental/genesis/src/status.ts)

<a id="ctxgenesistasks--genesistaskgateway"></a>

### `ctx.genesisTasks` — `GenesisTaskGateway`

Operator inspection shares the live task owner's reads and never impersonates a Life Agent.

```ts cordis-catalog
/**
 * Read managed tasks only in currently accessible, unarchived workspaces.
 * @param offset - Page position; the task owner's configured limits bound results.
 * @param signal - Caller cancellation, combined with the service lifetime.
 * @returns Actual sampled execution and delivery states without loading or dispatching Agents.
 */
@Remote('catalog') async catalog(offset: number, signal: AbortSignal): Promise<ManagedTaskCatalog>
```

Source: [`packages/experimental/genesis/src/task-gateway.ts`](../../packages/experimental/genesis/src/task-gateway.ts)

<a id="ctxgenesistemporary--genesistemporarygateway"></a>

### `ctx.genesisTemporary` — `GenesisTemporaryGateway`

Operator controls never send a conversation message or change long-term memories.

```ts cordis-catalog
/**
 * Read current settings, expiry times and pending failures.
 * @param signal - Caller cancellation.
 * @returns Bounded operator sample.
 */
@Remote('inspect') inspect(signal: AbortSignal): Promise<TemporaryStatus>

/**
 * Save independent summary model and quiet interval.
 * @param settings - Complete nonsecret draft.
 * @param revision - Displayed revision.
 * @param signal - Caller cancellation.
 * @returns Committed revision.
 */
@Remote('save') save(settings: TemporarySettings, revision: number, signal: AbortSignal): Promise<number>

/**
 * Remove a current summary; next context admission carries its removal.
 * @param id - Summary identity.
 * @param signal - Caller cancellation.
 * @returns After removal commits.
 */
@Remote('forget') forget(id: TemporaryMemoryId, signal: AbortSignal): Promise<void>

/**
 * Explicitly retry a failed batch without resetting committed progress.
 * @param sessionId - Failed source conversation.
 * @param signal - Caller cancellation.
 * @returns After the admitted retry settles.
 */
@Remote('retry') retry(sessionId: SessionId, signal: AbortSignal): Promise<void>

/**
 * Store or remove the fixed summary endpoint credential; it is never returned.
 * @param value - Secret or undefined to remove it.
 * @param signal - Caller cancellation.
 * @returns After the credential provider confirms the write.
 */
@Remote('setKey') setKey(value: string | undefined, signal: AbortSignal): Promise<void>
```

Types: [SessionId](core.zh.md)

Source: [`packages/experimental/genesis/src/temporary-gateway.ts`](../../packages/experimental/genesis/src/temporary-gateway.ts)

<a id="ctxgenesistoolkits--genesistoolkitgateway"></a>

### `ctx.genesisToolkits` — `GenesisToolkitGateway`

Catalogue editing never teaches tools or grants execution permission.

```ts cordis-catalog
/**
 * Read the complete editable catalogue, including empty groups and unknown member rules.
 * @param signal - Caller cancellation.
 * @returns Detached catalogue plus learned and currently registered names; neither implies authorization.
 */
@Remote('inspect') inspect(signal: AbortSignal): Promise<ToolkitStatus>

/**
 * Replace operator definitions with optimistic concurrency; existing conversation activations retain their IDs.
 * @param entries - Complete definitions, validated before any write; innate tools cannot be grouped.
 * @param revision - Last displayed catalogue revision.
 * @param signal - Caller cancellation; admitted writes drain even after cancellation.
 * @returns Committed revision; stale or invalid drafts do not replace confirmed settings.
 */
@Remote('save') save(entries: ToolkitDefinition[], revision: number, signal: AbortSignal): Promise<number>
```

Source: [`packages/experimental/genesis/src/toolkit-gateway.ts`](../../packages/experimental/genesis/src/toolkit-gateway.ts)
<!-- END GENERATED cordis-surface -->
