---
description: "Connect Telegram and Matrix text conversations to the Genesis im plugin."
---

# Genesis IM

English | [中文](im.zh.md)

## Summary

Open **Plugins → Genesis → im** to configure [QQ through OneBot](qq.md) and inspect Telegram and Matrix. The added channels use the same Genesis life name and the profile's conversation model. They store separate histories by platform account and chat. Telegram topics also have separate histories.

## Contents

[Connect](#connect) · [Replies and recovery](#replies-and-recovery)

<a id="connect"></a>
## Connect

Run `pnpm dsh web`, complete [first awakening](awakening.md), then enable **im** in **Plugins → Genesis**. Open its **Settings** to see the enable button beside each channel.

1. Expand the channel connection settings and fill in both allowlists. Telegram uses numeric chat and user IDs. Matrix uses room IDs starting with `!` and full user IDs starting with `@`. Separate entries with commas or spaces. Each incoming message must match both lists.
2. For Matrix, enter the homeserver origin, such as `https://matrix.example.org`. A loopback HTTP origin is also accepted. Select **Save and apply**, then click **Enable Telegram** or **Enable Matrix** in the channel header.
3. Save the BotFather token for Telegram or the Matrix access token for an account already joined to the allowed rooms. A Telegram bot needs its own poller and must have its webhook disabled. Tokens stay in the Harness credential store and their values are hidden after saving.

Settings apply immediately and are restored on restart. Refresh the panel to see the latest state, then send plain text from an allowed sender in an allowed chat. Telegram group messages must reach the bot under Telegram's privacy settings. Matrix starts from a sync checkpoint and replies to subsequent ordinary text messages. It skips encrypted events, edits, replies and threads.

Existing deployment values supply defaults until the first UI save for each channel. Environment credentials may still be used when no managed token exists. Remove the current Matrix token before changing its homeserver. If a token comes from the process environment, clear it at the source and restart before changing the address.

<a id="replies-and-recovery"></a>
## Replies and recovery

Telegram and Matrix reply in the originating chat or Telegram topic. Inputs and replies enter the Session log. Each channel resumes from its stored checkpoint and skips already recorded input. Polling pauses while Genesis is asleep. Text conversations cannot execute tools or retrieve private life memories, and they have no media or proactive sending. QQ has its own existing capabilities and permissions.

If a send fails, the channel stops and the Host logs report that the outcome may be uncertain. Inspect the original chat before applying settings again or sending a new message. Genesis will skip the input that already reached the Session. A Matrix limited timeline reports a gap in the Host logs. Click **Disable Telegram** or **Disable Matrix** in the channel header to stop polling; the normal Session deletion flow removes its local transcript.
