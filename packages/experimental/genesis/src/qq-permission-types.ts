/** Operator-owned QQ tool grants, independent of conversation admission and learning. @module */

/** A person rule applies across groups and private chats; a group rule applies to every authenticated speaker there. */
export interface QqPermissionRule {
  scope: 'person' | 'group'
  target: string
  tool: string
  effect: 'allow' | 'deny'
}
/** Complete revision-fenced policy; an empty policy retains the existing QQ defaults. */
export interface QqPermissionStatus {
  revision: number
  rules: QqPermissionRule[]
}
