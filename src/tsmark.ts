import type { TsmarkNode } from './types.d.ts';

function indentWidth(line: string): number {
  let col = 0;
  for (const ch of line) {
    if (ch === ' ') {
      col++;
    } else if (ch === '\t') {
      col += 4 - (col % 4);
    } else {
      break;
    }
  }
  return col;
}

function stripIndent(line: string): string {
  let col = 0;
  let idx = 0;
  while (col < 4 && idx < line.length) {
    const ch = line[idx];
    if (ch === ' ') {
      col++;
      idx++;
    } else if (ch === '\t') {
      const add = 4 - (col % 4);
      col += add;
      idx++;
    } else {
      break;
    }
  }
  return line.slice(idx);
}

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

    // indented code block (indentation >= 4 spaces)
    if (indentWidth(line) >= 4) {
      const codeLines: string[] = [];
      while (
        i < lines.length && (indentWidth(lines[i]) >= 4 || lines[i] === '')
      ) {
        codeLines.push(lines[i]);
        i++;
      }

      while (codeLines.length > 0 && codeLines[codeLines.length - 1] === '') {
        codeLines.pop();
      }

      const content = codeLines.map((l) => stripIndent(l)).join('\n');

      nodes.push({ type: 'code_block', content: content + '\n' });
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
