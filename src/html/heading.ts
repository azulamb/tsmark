import type { RefDef, TsmarkNode } from '../types.d.ts';
import { inlineToHTML } from '../nodes/inline.ts';

export function headingToHTML(
  node: TsmarkNode & { type: 'heading' },
  refs?: Map<string, RefDef>,
): string {
  return `<h${node.level}>${inlineToHTML(node.content, refs)}</h${node.level}>`;
}
