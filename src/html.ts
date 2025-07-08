import type { RefDef, TsmarkNode } from './types.d.ts';
import { headingToHTML } from './html/heading.ts';
import { paragraphToHTML } from './html/paragraph.ts';
import { codeBlockToHTML } from './html/code_block.ts';
import { listToHTML } from './html/list.ts';
import { blockquoteToHTML } from './html/blockquote.ts';
import { thematicBreakToHTML } from './html/thematic_break.ts';
import { htmlToHTML } from './html/html.ts';
import { parse } from './tsmark.ts';

function nodeToHTML(node: TsmarkNode, refs?: Map<string, RefDef>): string {
  if (node.type === 'heading') {
    return headingToHTML(node, refs);
  } else if (node.type === 'paragraph') {
    return paragraphToHTML(node, refs);
  } else if (node.type === 'code_block') {
    return codeBlockToHTML(node, refs);
  } else if (node.type === 'list') {
    return listToHTML(node, (n) => nodeToHTML(n, refs), refs);
  } else if (node.type === 'list_item') {
    return node.children.map((n) => nodeToHTML(n, refs)).join('');
  } else if (node.type === 'blockquote') {
    return blockquoteToHTML(node, (n) => nodeToHTML(n, refs), refs);
  } else if (node.type === 'thematic_break') {
    return thematicBreakToHTML(node);
  } else if (node.type === 'html') {
    return htmlToHTML(node, refs);
  }
  return '';
}

export function convertToHTML(md: string): string {
  const { nodes, refs } = parse(md);
  const html = nodes.map((node) => nodeToHTML(node, refs)).join('\n');
  return html ? html + '\n' : '';
}
