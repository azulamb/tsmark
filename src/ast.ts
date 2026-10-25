/** A parsed CommonMark document. */
export interface DocumentNode {
  readonly type: 'document';
  readonly children: readonly BlockNode[];
}

/** A block-level CommonMark node. */
export type BlockNode =
  | BlockQuoteNode
  | CodeBlockNode
  | HeadingNode
  | HtmlBlockNode
  | ListNode
  | ParagraphNode
  | ThematicBreakNode;

/** An inline CommonMark node. */
export type InlineNode =
  | CodeNode
  | EmphasisNode
  | HardBreakNode
  | HtmlInlineNode
  | ImageNode
  | LinkNode
  | SoftBreakNode
  | StrongNode
  | TextNode;

export interface BlockQuoteNode {
  readonly type: 'blockQuote';
  readonly children: readonly BlockNode[];
}

/**
 * An indented or fenced code block.
 *
 * `info` is null for indented blocks and fences without an info string.
 */
export interface CodeBlockNode {
  readonly type: 'codeBlock';
  readonly value: string;
  readonly info: string | null;
}

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface HeadingNode {
  readonly type: 'heading';
  readonly level: HeadingLevel;
  readonly children: readonly InlineNode[];
}

/** Raw HTML accepted by the CommonMark HTML block rules. */
export interface HtmlBlockNode {
  readonly type: 'htmlBlock';
  readonly value: string;
}

export type ListNode = OrderedListNode | BulletListNode;

export interface OrderedListNode {
  readonly type: 'list';
  readonly ordered: true;
  readonly start: number;
  readonly delimiter: '.' | ')';
  readonly tight: boolean;
  readonly children: readonly ListItemNode[];
}

export interface BulletListNode {
  readonly type: 'list';
  readonly ordered: false;
  readonly marker: '-' | '+' | '*';
  readonly tight: boolean;
  readonly children: readonly ListItemNode[];
}

export interface ListItemNode {
  readonly type: 'listItem';
  readonly children: readonly BlockNode[];
}

export interface ParagraphNode {
  readonly type: 'paragraph';
  readonly children: readonly InlineNode[];
}

export interface ThematicBreakNode {
  readonly type: 'thematicBreak';
}

export interface CodeNode {
  readonly type: 'code';
  readonly value: string;
}

export interface EmphasisNode {
  readonly type: 'emphasis';
  readonly children: readonly InlineNode[];
}

export interface HardBreakNode {
  readonly type: 'hardBreak';
}

/** Raw HTML accepted by the CommonMark inline HTML rules. */
export interface HtmlInlineNode {
  readonly type: 'htmlInline';
  readonly value: string;
}

export interface ImageNode {
  readonly type: 'image';
  readonly destination: string;
  readonly title: string | null;
  readonly description: readonly InlineNode[];
}

export interface LinkNode {
  readonly type: 'link';
  readonly destination: string;
  readonly title: string | null;
  readonly children: readonly InlineNode[];
}

export interface SoftBreakNode {
  readonly type: 'softBreak';
}

export interface StrongNode {
  readonly type: 'strong';
  readonly children: readonly InlineNode[];
}

export interface TextNode {
  readonly type: 'text';
  readonly value: string;
}
