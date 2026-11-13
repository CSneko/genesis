---
kind: upgrade-guide
description: "Genesis spontaneous cognition removes three execution caps and changes the budget editor to millions of tokens."
---

# Spontaneous cognition budgets

English | [中文](guide.zh.md)

## Change

Spontaneity removes `requestTokens`, `maxRequests` and `maxToolCalls`. Its total output budget defaults to 50,000,000 tokens (50M), and `maxOutputTokens` accepts positive safe integers up to 9,007,199,254,740,991. The Thoughts editor uses M tokens; configuration and settings APIs continue using raw tokens. Existing saved budgets keep their amounts. Legacy stored controls are normalized on loading and omit the three retired fields on the next write. Current settings APIs reject those fields. Older runtimes cannot necessarily read normalized controls or budgets above their previous limit; retain matching backups before downgrading.

## Migration

1. Remove `requestTokens`, `maxRequests` and `maxToolCalls` from the `spontaneity` section of Genesis `cordis.yml` patches and from settings API request objects. These configuration fields no longer apply.
2. Open Genesis → Thoughts and set the output budget to `50` for 50M tokens, or enter a larger value. Existing explicit budgets are preserved; the new default applies when no saved or configured override exists. In configuration or API requests, use `maxOutputTokens: 50000000` for the same budget.
3. Save, refresh and restart to confirm the displayed amount persists. Main-model requests use route/provider output limits, or the remaining total budget when neither is advertised. Output reservations still include auxiliary calls and retries and are not refunded. Opportunity deadlines, daily quotas, authorization and stop controls remain effective. See [budgets](../../../genesis/spontaneity.md).
