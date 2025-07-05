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

    // thematic break
    if (
      /^ {0,3}(\*\s*){3,}$/.test(line) || /^ {0,3}(-\s*){3,}$/.test(line) ||
      /^ {0,3}(_\s*){3,}$/.test(line)
    ) {
      nodes.push({ type: 'thematic_break' });
      i++;
      continue;
    }

    // blockquote
    const bqMatch = line.match(/^ {0,3}> ?(.*)$/);
    if (bqMatch) {
      const bqLines: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^ {0,3}> ?(.*)$/);
        if (m) {
          bqLines.push(m[1]);
          i++;
        } else if (lines[i].trim() === '') {
          bqLines.push('');
          i++;
        } else break;
      }
      const children = parse(bqLines.join('\n'));
      nodes.push({ type: 'blockquote', children });
      continue;
    }

    // list
    const listItemMatch = line.match(/^ {0,3}([-+*]) +(.*)$/);
    if (listItemMatch) {
      const items: TsmarkNode[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^ {0,3}([-+*]) +(.*)$/);
        if (!m) break;
        const itemLines: string[] = [m[2]];
        i++;
        while (i < lines.length) {
          if (/^\s*$/.test(lines[i])) {
            itemLines.push('');
            i++;
            if (i < lines.length && /^\s/.test(lines[i])) {
              continue;
            } else {
              break;
            }
          } else if (/^\s/.test(lines[i])) {
            itemLines.push(lines[i]);
            i++;
          } else {
            break;
          }
        }
        const children = parse(itemLines.join('\n'));
        items.push({ type: 'list_item', children });
      }
      nodes.push({ type: 'list', ordered: false, items });
      continue;
    }

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
    return `<h${node.level}>${inlineToHTML(node.content)}</h${node.level}>`;
  } else if (node.type === 'paragraph') {
    return `<p>${inlineToHTML(node.content)}</p>`;
  } else if (node.type === 'code_block') {
    const escaped = node.content.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return `<pre><code>${escaped}</code></pre>`;
  } else if (node.type === 'list') {
    const items = node.items.map((it) => {
      if (it.type === 'list_item') {
        return `<li>\n${it.children.map(nodeToHTML).join('\n')}\n</li>`;
      }
      return `<li>${nodeToHTML(it)}</li>`;
    }).join('\n');
    return `<ul>\n${items}\n</ul>`;
  } else if (node.type === 'list_item') {
    return node.children.map(nodeToHTML).join('');
  } else if (node.type === 'blockquote') {
    return `<blockquote>\n${
      node.children.map(nodeToHTML).join('')
    }\n</blockquote>`;
  } else if (node.type === 'thematic_break') {
    return '<hr />';
  }
  return '';
}

function escapeHTML(text: string): string {
  return text.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;');
}

function inlineToHTML(text: string): string {
  let out = escapeHTML(text);
  // handle backslash escapes for punctuation characters
  // see CommonMark Spec 6. Backslash escapes
  out = out.replace(/\\([!"#$%&'()*+,\-.\/\:;<=>?@\[\]\\^_`{|}~])/g, '$1');
  // backslash at line end creates hard line break
  out = out.replace(/\\\n/g, '<br />\n');
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = out.replace(/_([^_]+)_/g, '<em>$1</em>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  out = out.replace(/ {2}\n/g, '<br />\n');
  return out;
}

export function convertToHTML(md: string): string {
  const nodes = parse(md);
  return nodes.map((node) => {
    return nodeToHTML(node);
  }).join('') + '\n';
}
