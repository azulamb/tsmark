import type { RefDef, TsmarkNode } from '../types.d.ts';
import { escapeHTML } from '../utils.ts';

export function codeBlockToHTML(
  node: TsmarkNode & { type: 'code_block' },
  _refs?: Map<string, RefDef>,
): string {
  const escaped = escapeHTML(node.content);
  const langClass = node.language
    ? ` class="language-${escapeHTML(node.language)}"`
    : '';
  return `<pre><code${langClass}>${escaped}</code></pre>`;
}
