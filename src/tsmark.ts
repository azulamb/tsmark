import type { TsmarkNode } from './types.d.ts';

const htmlCandidate =
  /<\/?[A-Za-z][^>\n]*>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<![A-Z]+\s+[^>]*>|<!\[CDATA\[[\s\S]*?\]\]>/g;

function isHtmlTag(tag: string): boolean {
  const openTag =
    /^<[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][A-Za-z0-9_.:-]*(?:=(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>$/;
  const closeTag = /^<\/[A-Za-z][A-Za-z0-9-]*\s*>$/;
  const comment = /^(?:<!---->|<!--(?:-?[^>-])(?:[^-]*-+)*?-->)$/s;
  const proc = /^<\?[\s\S]*?\?>$/;
  const decl = /^<![A-Z]+\s+[^>]*>$/;
  const cdata = /^<!\[CDATA\[[\s\S]*?\]\]>$/;
  return (
    openTag.test(tag) ||
    closeTag.test(tag) ||
    comment.test(tag) ||
    proc.test(tag) ||
    decl.test(tag) ||
    cdata.test(tag)
  );
}

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

function stripColumns(line: string, count: number): string {
  let col = 0;
  let idx = 0;
  let indent = '';
  while (idx < line.length) {
    const ch = line[idx];
    if (ch === ' ') {
      indent += ' ';
      col++;
      idx++;
    } else if (ch === '\t') {
      const width = 4 - (col % 4);
      indent += ' '.repeat(width);
      col += width;
      idx++;
    } else {
      break;
    }
  }

  const rest = line.slice(idx);
  if (count >= indent.length) {
    return rest;
  }
  return indent.slice(count) + rest;
}

function stripIndent(line: string): string {
  return stripColumns(line, 4);
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
    const bqMatch = line.match(/^ {0,3}>(.*)$/);
    if (bqMatch) {
      const bqLines: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^ {0,3}>(.*)$/);
        if (m) {
          let rest = m[1];
          if (rest.startsWith(' ')) {
            rest = rest.slice(1);
          } else if (rest.startsWith('\t')) {
            rest = '  ' + rest.slice(1);
          }
          rest = rest.replace(/\t/g, '    ');
          bqLines.push(rest);
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
    const listItemMatch = line.match(/^(\s{0,3})([-+*])([ \t]+.*)$/);
    if (listItemMatch) {
      const items: TsmarkNode[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s{0,3})([-+*])([ \t]+.*)$/);
        if (!m) break;
        const markerIndent = indentWidth(m[1]) + 2;
        const itemLines: string[] = [stripColumns(m[3], markerIndent)];
        i++;
        while (i < lines.length) {
          const ind = indentWidth(lines[i]);
          if (/^\s*$/.test(lines[i])) {
            itemLines.push('');
            i++;
            if (i < lines.length && indentWidth(lines[i]) >= markerIndent) {
              continue;
            } else {
              break;
            }
          } else if (ind >= markerIndent) {
            itemLines.push(stripColumns(lines[i], markerIndent));
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

    // HTML block (single line)
    {
      const m = line.match(/^ {0,3}(<.*>)$/);
      if (m && isHtmlTag(m[1])) {
        nodes.push({ type: 'html', content: m[1] });
        i++;
        continue;
      }
    }

    // paragraph
    if (line.trim() !== '') {
      const paraLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== '') {
        if (/^\s{0,3}[-+*][ \t]+/.test(lines[i])) break;
        paraLines.push(lines[i]);
        i++;
      }
      nodes.push({ type: 'paragraph', content: paraLines.join('\n') });
      continue;
    }

    // blank line
    i++;
  }

  return nodes;
}

type RefDef = { url: string; title?: string };

function nodeToHTML(node: TsmarkNode, refs?: Map<string, RefDef>): string {
  if (node.type === 'heading') {
    return `<h${node.level}>${
      inlineToHTML(node.content, refs)
    }</h${node.level}>`;
  } else if (node.type === 'paragraph') {
    return `<p>${inlineToHTML(node.content, refs)}</p>`;
  } else if (node.type === 'code_block') {
    const escaped = node.content.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return `<pre><code>${escaped}</code></pre>`;
  } else if (node.type === 'list') {
    const items = node.items.map((it) => {
      if (it.type === 'list_item') {
        const [first, ...rest] = it.children;
        if (!first) {
          return '<li></li>';
        }
        if (first.type === 'paragraph') {
          const firstHTML = inlineToHTML(first.content, refs);
          const restHTML = rest.map((n) => nodeToHTML(n, refs)).join('\n');
          if (rest.length === 0) {
            return `<li>${firstHTML}</li>`;
          }
          if (rest.every((n) => n.type === 'list')) {
            return `<li>${firstHTML}\n${restHTML}\n</li>`;
          }
          return `<li>\n<p>${firstHTML}</p>\n${restHTML}\n</li>`;
        }
        const inner = [first, ...rest].map((n) => nodeToHTML(n, refs)).join(
          '\n',
        );
        return `<li>\n${inner}\n</li>`;
      }
      return `<li>${nodeToHTML(it, refs)}</li>`;
    }).join('\n');
    return `<ul>\n${items}\n</ul>`;
  } else if (node.type === 'list_item') {
    return node.children.map((n) => nodeToHTML(n, refs)).join('');
  } else if (node.type === 'blockquote') {
    return `<blockquote>\n${
      node.children.map((n) => nodeToHTML(n, refs)).join('')
    }\n</blockquote>`;
  } else if (node.type === 'thematic_break') {
    return '<hr />';
  } else if (node.type === 'html') {
    return node.content;
  }
  return '';
}

function escapeHTML(text: string): string {
  return text.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;');
}

function stripMd(text: string): string {
  return text.replace(/[*_\[\]`]/g, '');
}

function inlineToHTML(text: string, refs?: Map<string, RefDef>): string {
  const placeholders: string[] = [];

  // store code spans as placeholders before any other processing
  text = text.replace(/(?<!\\)(`+)([\s\S]*?)\1/g, (_, _p1, p2) => {
    const token = `\u0002${placeholders.length}\u0002`;
    placeholders.push(`<code>${escapeHTML(p2.trim())}</code>`);
    return token;
  });

  // store autolinks as placeholders before handling escapes
  text = text.replace(/<([a-zA-Z][a-zA-Z0-9+.-]*:[^\s<>]*)>/g, (_, p1) => {
    const token = `\u0000${placeholders.length}\u0000`;
    placeholders.push(`<a href="${encodeURI(p1)}">${escapeHTML(p1)}</a>`);
    return token;
  });
  text = text.replace(/<([^\s@<>]+@[^\s@<>]+)>/g, (_, p1) => {
    const token = `\u0000${placeholders.length}\u0000`;
    placeholders.push(`<a href="mailto:${p1}">${escapeHTML(p1)}</a>`);
    return token;
  });

  // handle backslash escapes by storing them as placeholders
  text = text.replace(
    /\\([!"#$%&'()*+,\-.\/\:;<=>?@\[\]\\^_`{|}~])/g,
    (_, p1) => {
      const token = `\u0001${placeholders.length}\u0001`;
      placeholders.push(escapeHTML(p1));
      return token;
    },
  );

  // inline images (direct)
  text = text.replace(
    /!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]+)")?\)/g,
    (_, alt, href, title) => {
      let html = `<img src="${encodeURI(href.replace(/^<|>$/g, ''))}" alt="${
        escapeHTML(stripMd(alt))
      }"`;
      if (title) html += ` title="${escapeHTML(title)}"`;
      html += ' />';
      const token = `\u0000${placeholders.length}\u0000`;
      placeholders.push(html);
      return token;
    },
  );

  // reference-style images
  if (refs) {
    text = text.replace(/!\[([^\]]*)\]\[([^\]]*)\]/g, (m, alt, lab) => {
      const label = (lab || alt).toLowerCase();
      const def = refs.get(label);
      if (!def) return m;
      let html = `<img src="${encodeURI(def.url)}" alt="${
        escapeHTML(stripMd(alt))
      }"`;
      if (def.title) html += ` title="${escapeHTML(def.title)}"`;
      html += ' />';
      const token = `\u0000${placeholders.length}\u0000`;
      placeholders.push(html);
      return token;
    });

    text = text.replace(/!\[([^\]]+)\](?!\()/g, (m, alt) => {
      const label = alt.toLowerCase();
      const def = refs.get(label);
      if (!def) return m;
      let html = `<img src="${encodeURI(def.url)}" alt="${
        escapeHTML(stripMd(alt))
      }"`;
      if (def.title) html += ` title="${escapeHTML(def.title)}"`;
      html += ' />';
      const token = `\u0000${placeholders.length}\u0000`;
      placeholders.push(html);
      return token;
    });
  }

  // store HTML tags as placeholders

  text = text.replace(htmlCandidate, (m) => {
    if (isHtmlTag(m)) {
      let html = m;
      if (html.startsWith('<!-->') || html.startsWith('<!--->')) {
        html = html.replace(/>$/, '&gt;');
      }
      const token = `\u0000${placeholders.length}\u0000`;
      placeholders.push(html);
      return token;
    }
    return m;
  });

  let out = escapeHTML(text);

  // backslash at line end creates hard line break
  out = out.replace(/\\\n/g, '<br />\n');

  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = out.replace(/_([^_]+)_/g, '<em>$1</em>');
  out = out.replace(
    /\[([^\]]+)\]\(([^\s)]+)(?:\s+"([^"]+)")?\)/g,
    (_, p1, p2, p3) => {
      const titleAttr = p3 ? ` title="${escapeHTML(p3)}"` : '';
      return `<a href="${p2}"${titleAttr}>${p1}</a>`;
    },
  );

  if (refs) {
    out = out.replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (m, text, lab) => {
      const key = (lab || text).toLowerCase();
      const def = refs.get(key);
      if (!def) return m;
      const titleAttr = def.title ? ` title="${escapeHTML(def.title)}"` : '';
      return `<a href="${def.url}"${titleAttr}>${text}</a>`;
    });

    out = out.replace(/\[([^\]]+)\](?!\()/g, (m, text) => {
      const def = refs.get(text.toLowerCase());
      if (!def) return m;
      const titleAttr = def.title ? ` title="${escapeHTML(def.title)}"` : '';
      return `<a href="${def.url}"${titleAttr}>${text}</a>`;
    });
  }
  out = out.replace(/ {2}\n/g, '<br />\n');
  out = out.replace(/ (?=\n)/g, '');

  // restore placeholders
  out = out.replace(/\u0000(\d+)\u0000/g, (_, idx) => placeholders[+idx]);
  out = out.replace(/\u0001(\d+)\u0001/g, (_, idx) => placeholders[+idx]);
  out = out.replace(/\u0002(\d+)\u0002/g, (_, idx) => placeholders[+idx]);

  return out;
}

export function convertToHTML(md: string): string {
  const refDef = /^ {0,3}\[([^\]]+)\]:\s*(\S+)(?:\s+"([^"]+)")?\s*$/;
  const refs = new Map<string, RefDef>();
  const filtered: string[] = [];
  for (const line of md.replace(/\r\n?/g, '\n').split('\n')) {
    const m = line.match(refDef);
    if (m) {
      let url = m[2];
      if (url.startsWith('<') && url.endsWith('>')) {
        url = url.slice(1, -1);
      }
      refs.set(m[1].toLowerCase(), { url, title: m[3] });
    } else {
      filtered.push(line);
    }
  }
  const nodes = parse(filtered.join('\n'));
  return nodes.map((node) => {
    return nodeToHTML(node, refs);
  }).join('\n') + '\n';
}
