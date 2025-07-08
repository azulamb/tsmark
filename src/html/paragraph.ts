import type { RefDef, TsmarkNode } from '../types.d.ts';
import { inlineToHTML } from '../nodes/inline.ts';

export function paragraphToHTML(
  node: TsmarkNode & { type: 'paragraph' },
  refs?: Map<string, RefDef>,
): string {
  return `<p>${inlineToHTML(node.content, refs)}</p>`;
}
