import type { TsmarkNode } from './types.d.ts';

export function parse(md: string): TsmarkNode[] {
  return [];
}

function nodeToHTML(node: TsmarkNode): string {
    if (node.type === 'heading') {
      return `<h${node.level}>${node.content}</h${node.level}>`;
    } else if (node.type === 'paragraph') {
      return `<p>${node.content}</p>`;
    }
    return '';
}

export function parseToHTML(md: string): string {
  const nodes = parse(md);
  return nodes.map((node) => {
    return nodeToHTML(node);
  }).join('') + '\n';
}
