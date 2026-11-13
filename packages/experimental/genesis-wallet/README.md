---
description: "Life-bound wallet balances, product catalogs and operator-confirmed purchases."
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-genesis-wallet

English | [中文](README.zh.md)

## Summary

The optional Genesis wallet adds independent CNY and USD balances, custom products, purchase requests and annotated transactions. Its browser entry is **Whale vouchers**; the learned model tool is `wallet`. The source-workspace Genesis Web profile includes this bundle. Confirming a purchase changes wallet state without notifying or waking any conversation.

## Table of Contents

[Use](#use) · [Implementation](#implementation) · [Model Experience](#model-experience) · [Known Limitations and Deferred Work](#known-limitations-and-deferred-work) · [Dev Note](#dev-note)

<a id="use"></a>
## Use

Start the supported source-workspace entry with `pnpm dsh web`, then open **Whale vouchers** in the left sidebar. CNY and USD have separate balances; the page name does not introduce another currency. Set balance replaces the current value without a transaction, old-value record or model notification. Deposit and transfer require a note and retain a transaction. Existing conversation evidence and storage backups are separate from wallet edit history.

Create products with a title, description, price, currency, specification and optional HTTP(S) purchase link. Edit, disable or remove catalog products without changing order snapshots. Teach the character `wallet` in an operator Life conversation. It can inspect balances and products, submit a quoted purchase request, read orders and cancel requests from their originating conversation. It cannot edit balances, create custom products, settle orders or refund purchases. QQ group calls are allowed when the current authenticated speaker is the bound operator and the QQ tool policy permits `wallet`; another group member cannot reuse that authority.

Pending requests show a red dot on the sidebar icon, refreshed at `pollMs`; viewing the page does not clear it. Confirmation checks the current currency balance and commits the deduction, order and transaction together. Pending requests reserve no funds. Repeated confirmation does not charge twice. Rejection and cancellation do not deduct funds; refund credits the purchased amount once. Confirmation produces no message, attention event or automatic model request. The character learns the current status only by explicitly querying the wallet.

Balances, products, orders and ledger entries persist in the version-one `genesis_wallet` storage domain, bound to the stable Genesis life identity. Missing initialized state or mismatched life ownership rejects instead of creating a replacement wallet. Uncertain writes stop subsequent wallet operations until verified storage is reloaded. To delete wallet data, stop Genesis and remove it together with the corresponding life integration ownership; deleting only wallet files deliberately prevents silent reinitialization. Session logs and backups require separate lifecycle deletion.

### Built-in Taobao source

The default source is [Yuantoutao](https://yuantoutao.com/developers). No endpoint configuration is needed. Without a key, searches read its curated Taobao/Tmall catalog. In **Whale vouchers → Products**, optionally save a free Yuantoutao API key to request broader live results; the application link is beside the field. Key availability, quotas and upstream freshness belong to the provider. The wallet never registers an account or claims a key automatically.

The key is stored through the credential service under `GENESIS_WALLET_TAOBAO_KEY` (`taobaoCredentialRef`), independently of wallet records and Session context. The same reference can resolve an environment credential. Removing a managed key does not remove inherited credentials. Unknown credential writes visibly stop built-in queries until verified credentials are reloaded; balance and order operations remain available. `taobaoEndpoint` defaults to `https://mcp.yuantoutao.com/mcp` and supports an explicit deployment override.

Only `cps_smart_search` and `shelf_item` read operations are called; no upstream order, payment or fulfillment tools are mounted. Queries are restricted to Taobao/Tmall and normalize the provider's integer CNY prices. Supported product links are Taobao/Tmall URLs containing `id`, and Yuantoutao `/go/tb/<id>` or `/p/tb/<id>` links. Link lookup reads indexed catalog items, so unindexed products and short links may require keyword search. Prices are source quotes, not stock verification or guaranteed checkout prices. Provider purchase links may include affiliate attribution; the wallet adds no attribution identifier.

### Custom information adapter

To override the built-in source, configure `productEndpoint` on the `genesis-wallet` plugin row using an operator-controlled HTTP(S) JSON adapter. The plugin sends GET requests to that fixed address with either `query=<keyword>` or `url=<product URL>`. Model-supplied URLs are query data; the plugin does not fetch those addresses directly. Redirects are refused. Set `credentialRef` to an existing credential reference if the adapter needs a Bearer token; credentials never enter product records or model results.

The adapter returns `{ "items": [...] }`. Each item requires `title`, `description`, `price`, `currency`, `url`, `specification`, `available` and `source: "taobao"`. Prices are integer minor units: 3500 means CNY 35.00 or USD 35.00. Responses are limited by `timeoutMs`, `maxResponseBytes` and `pageSize`. Querying reads information only. The operator can import a candidate into the editable catalog. The model's `import` action fetches the query again and selects `index` (default zero); matching source URL and specification reuse the existing catalog entry, preserving operator edits. Inspect the imported quote before submitting `buy`.

The custom adapter owns its upstream Taobao API account, authorization and response mapping. Custom-source credentials use `credentialRef` and are never sent to the built-in source. Product text remains untrusted data and grants no permissions.

<a id="implementation"></a>
## Implementation

<details>
<summary>Storage, authority and resource ownership</summary>

`cordis.patch.yml` mounts an optional wallet service beside Genesis; disabling the bundle preserves ordinary Harness behavior. One serialized whole-state write owns balances, product snapshots, order transitions and ledger receipts. Actual Session/tool-call IDs deduplicate purchase submission; a changed replay is refused. Operator mutations use displayed revisions, so repeated stale transfers cannot apply twice. Full state and complete model results have separate configured budgets. Wallet queries abort and drain before storage disposal.

`pageSize`, `maxRecords`, `maxStateChars`, `resultChars`, `pollMs`, `timeoutMs` and `maxResponseBytes` control deployment limits. `lifePreset` selects the allowed preset. Model execution additionally requires an operator Life conversation; QQ checks the current authenticated speaker and verified conversation route instead of treating group membership as operator identity. Existing learning, sandbox and tool guards still apply. The authenticated operator Remote owns balance editing, catalog management and settlement. It does not expose those operations to the model tool.

</details>

<a id="model-experience"></a>
## Model Experience

The `wallet` schema is available through ordinary Genesis tool learning. Results use integer fen or cents and identify currency explicitly. Lists and source responses are bounded; purchases retain exact product snapshots. No wallet data is automatically injected into prompts. Tool results enter the existing Session log; operator balance edits and confirmations do not add model context or request model work. `purchased` is the completed wallet purchase state and does not grant tool access or establish runtime capability availability.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

The wallet performs no real payments or platform ordering, currency exchange, shipping tracking or inventory reservation. The built-in source covers its curated catalog without a key; a provider key requests live search. It does not guarantee full Taobao coverage or every product link. Provider credentials, limits and availability remain external dependencies. Retained wallet history has an explicit capacity limit; automatic archival is not implemented. The single life owns the wallet; ordinary QQ speakers cannot access it, even through a group-wide tool grant. Bound operators can invoke it from their current group messages, but earlier operator messages and quoted identities grant no authority to later speakers.

<a id="dev-note"></a>
## Dev Note

See [Genesis services](../../../docs/subsystems/genesis.md) for life ownership and [the browser companion](../client-ui-genesis/README.md) for the surrounding workspace. The Loader integration test uses isolated JSON storage and a local HTTP source to check settlement, replay, restart continuity, missing-state refusal and response limits.
