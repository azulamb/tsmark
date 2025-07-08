import type { RefDef, TsmarkNode } from '../types.d.ts';
import { inlineToHTML } from '../nodes/inline.ts';

function listItemToHTML(
  item: TsmarkNode & { type: 'list_item' },
  loose: boolean,
  toHTML: (node: TsmarkNode) => string,
  refs?: Map<string, RefDef>,
): string {
  const [first, ...rest] = item.children;
  if (!first) {
    return '<li></li>';
  }
  if (first.type === 'paragraph') {
    const firstHTML = inlineToHTML(first.content, refs);
    const restHTML = rest.map((n) => {
      if (n.type === 'paragraph' && !loose) {
        return inlineToHTML(n.content, refs);
      }
      return toHTML(n);
    }).join('\n');
    if (!loose) {
      if (rest.length === 0) {
        return `<li>${firstHTML}</li>`;
      }
      return `<li>${firstHTML}\n${restHTML}\n</li>`;
    }
    if (rest.length === 0) {
      return loose
        ? `<li>\n<p>${firstHTML}</p>\n</li>`
        : `<li><p>${firstHTML}</p></li>`;
    }
    return `<li>\n<p>${firstHTML}</p>\n${restHTML}\n</li>`;
  }
  const inner = [first, ...rest].map((n) => {
    if (n.type === 'paragraph' && !loose) {
      return inlineToHTML(n.content, refs);
    }
    return toHTML(n);
  }).join('\n');
  const trailing =
    item.children[item.children.length - 1]?.type === 'paragraph' && !loose
      ? ''
      : '\n';
  return `<li>\n${inner}${trailing}</li>`;
}

export function listToHTML(
  node: TsmarkNode & { type: 'list' },
  toHTML: (node: TsmarkNode) => string,
  refs?: Map<string, RefDef>,
): string {
  const items = node.items.map((it) => {
    if (it.type === 'list_item') {
      return listItemToHTML(it, node.loose ?? false, toHTML, refs);
    }
    return `<li>${toHTML(it)}</li>`;
  }).join('\n');
  const tag = node.ordered ? 'ol' : 'ul';
  const attr = node.ordered && (node as any).start !== undefined &&
      (node as any).start !== 1
    ? ` start="${(node as any).start}"`
    : '';
  return `<${tag}${attr}>\n${items}\n</${tag}>`;
}
