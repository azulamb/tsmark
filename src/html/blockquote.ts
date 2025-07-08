import type { RefDef, TsmarkNode } from '../types.d.ts';

export function blockquoteToHTML(
  node: TsmarkNode & { type: 'blockquote' },
  toHTML: (node: TsmarkNode) => string,
  refs?: Map<string, RefDef>,
): string {
  const inner = node.children.map((n) => toHTML(n)).join('\n');
  return inner === ''
    ? '<blockquote>\n</blockquote>'
    : `<blockquote>\n${inner}\n</blockquote>`;
}
