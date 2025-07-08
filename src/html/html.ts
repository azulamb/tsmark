import type { RefDef, TsmarkNode } from '../types.d.ts';

export function htmlToHTML(
  node: TsmarkNode & { type: 'html' },
  _refs?: Map<string, RefDef>,
): string {
  return node.content;
}
