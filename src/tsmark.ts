import type { TsmarkNode } from './types.d.ts';

export function parse(md: string): TsmarkNode[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const nodes: TsmarkNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // fenced code block
    const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
    if (fenceMatch) {
      const fence = fenceMatch[2];
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith(fence)) {
        codeLines.push(lines[i]);
        i++;
      }
      // skip closing fence
      if (i < lines.length) i++;
      nodes.push({ type: 'code_block', content: codeLines.join('\n') + '\n' });
      continue;
    }

    // indented code block (4 spaces or tab)
    if (/^( {4}|\t)/.test(line)) {
      const codeLines: string[] = [];
      while (
        i < lines.length && (/^( {4}|\t)/.test(lines[i]) || lines[i] === '')
      ) {
        codeLines.push(lines[i].replace(/^( {4}|\t)/, ''));
        i++;
      }
      nodes.push({ type: 'code_block', content: codeLines.join('\n') + '\n' });
      continue;
    }

    // ATX heading
    const atx = line.match(/^(#{1,6})\s+(.*)$/);
    if (atx) {
      const level = atx[1].length;
      const content = atx[2].replace(/\s+#+\s*$/, '').trim();
      nodes.push({ type: 'heading', level, content });
      i++;
      continue;
    }

    // Setext heading
    if (i + 1 < lines.length) {
      const next = lines[i + 1];
      const setext = next.match(/^([-=])+\s*$/);
      if (setext && line.trim() !== '') {
        const level = next.trim().startsWith('=') ? 1 : 2;
        nodes.push({ type: 'heading', level, content: line.trim() });
        i += 2;
        continue;
      }
    }

    // paragraph
    if (line.trim() !== '') {
      const paraLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== '') {
        paraLines.push(lines[i]);
        i++;
      }
      nodes.push({ type: 'paragraph', content: paraLines.join(' ') });
      continue;
    }

    // blank line
    i++;
  }

  return nodes;
}

function nodeToHTML(node: TsmarkNode): string {
  if (node.type === 'heading') {
    return `<h${node.level}>${node.content}</h${node.level}>`;
  } else if (node.type === 'paragraph') {
    return `<p>${node.content}</p>`;
  } else if (node.type === 'code_block') {
    const escaped = node.content.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return `<pre><code>${escaped}</code></pre>`;
  }
  return '';
}

export function convertToHTML(md: string): string {
  const nodes = parse(md);
  return nodes.map((node) => {
    return nodeToHTML(node);
  }).join('') + '\n';
}
