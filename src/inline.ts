import {
  decodeEntities,
  encodeHref,
  escapeHTML,
  isHtmlTag,
  normalizeLabel,
  unescapeMd,
} from './utils.ts';
import type { RefDef } from './types.d.ts';

export function inlineToHTML(
  text: string,
  refs?: Map<string, RefDef>,
  placeholders: string[] = [],
): string {
  // store code spans as placeholders before any other processing
  text = text.replace(
    /(?<![\\"'=`])(`+)(?!`)([\s\S]*?)(?<!`)\1(?!`)/g,
    (full, p1, p2, offset, str) => {
      const start = offset;
      const end = offset + full.length;
      const lt = str.lastIndexOf('<', start);
      const gt = str.indexOf('>', start);
      if (lt !== -1 && gt !== -1 && lt < start && gt < end) {
        return full;
      }
      let content = p2.replace(/\n/g, ' ');
      if (
        content.startsWith(' ') &&
        content.endsWith(' ') &&
        content.trim() !== ''
      ) {
        content = content.slice(1, -1);
      }
      const token = `\u0002${placeholders.length}\u0002`;
      placeholders.push(`<code>${escapeHTML(content)}</code>`);
      return token;
    },
  );

  // store autolinks as placeholders before handling escapes
  text = text.replace(
    /<([a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^\s<>]*)>/g,
    (_, p1) => {
      const token = `\u0000${placeholders.length}\u0000`;
      const href = encodeHref(p1);
      placeholders.push(`<a href="${escapeHTML(href)}">${escapeHTML(p1)}</a>`);
      return token;
    },
  );
  text = text.replace(/<([^\s@<>\\]+@[^\s@<>\\]+)>/g, (_, p1) => {
    const token = `\u0000${placeholders.length}\u0000`;
    placeholders.push(
      `<a href="mailto:${escapeHTML(p1)}">${escapeHTML(p1)}</a>`,
    );
    return token;
  });

  // store HTML tags as placeholders before processing escapes
  {
    let result = '';
    let idx = 0;
    while (idx < text.length) {
      const lt = text.indexOf('<', idx);
      if (lt === -1) {
        result += text.slice(idx);
        break;
      }
      result += text.slice(idx, lt);

      if (text.startsWith('<!--', lt)) {
        let candidate: string;
        if (text.startsWith('<!-->', lt) || text.startsWith('<!--->', lt)) {
          candidate = text.startsWith('<!--->', lt) ? '<!--->' : '<!-->';
          const end = lt + candidate.length;
          if (
            isHtmlTag(candidate) &&
            (lt === 0 || (text[lt - 1] !== '(' && text[lt - 1] !== '\\'))
          ) {
            const token = `\u0000${placeholders.length}\u0000`;
            placeholders.push(candidate);
            result += token;
          } else {
            result += candidate;
          }
          idx = end;
          continue;
        }
        const end = text.indexOf('-->', lt + 4);
        candidate = end === -1 ? text.slice(lt) : text.slice(lt, end + 3);
        if (
          isHtmlTag(candidate) &&
          (lt === 0 || (text[lt - 1] !== '(' && text[lt - 1] !== '\\'))
        ) {
          const token = `\u0000${placeholders.length}\u0000`;
          placeholders.push(candidate);
          result += token;
        } else {
          result += candidate;
        }
        idx = end === -1 ? text.length : end + 3;
        continue;
      } else if (text.startsWith('<?', lt)) {
        const end = text.indexOf('?>', lt + 2);
        const candidate = end === -1 ? text.slice(lt) : text.slice(lt, end + 2);
        if (
          isHtmlTag(candidate) &&
          (lt === 0 || (text[lt - 1] !== '(' && text[lt - 1] !== '\\'))
        ) {
          const token = `\u0000${placeholders.length}\u0000`;
          placeholders.push(candidate);
          result += token;
        } else {
          result += candidate;
        }
        idx = end === -1 ? text.length : end + 2;
        continue;
      } else if (text.startsWith('<![CDATA[', lt)) {
        const end = text.indexOf(']]>', lt + 9);
        const candidate = end === -1 ? text.slice(lt) : text.slice(lt, end + 3);
        if (
          isHtmlTag(candidate) &&
          (lt === 0 || (text[lt - 1] !== '(' && text[lt - 1] !== '\\'))
        ) {
          const token = `\u0000${placeholders.length}\u0000`;
          placeholders.push(candidate);
          result += token;
        } else {
          result += candidate;
        }
        idx = end === -1 ? text.length : end + 3;
        continue;
      } else if (text.startsWith('<!', lt)) {
        const end = text.indexOf('>', lt + 2);
        const candidate = end === -1 ? text.slice(lt) : text.slice(lt, end + 1);
        if (
          isHtmlTag(candidate) &&
          (lt === 0 || (text[lt - 1] !== '(' && text[lt - 1] !== '\\'))
        ) {
          const token = `\u0000${placeholders.length}\u0000`;
          placeholders.push(candidate);
          result += token;
        } else {
          result += candidate;
        }
        idx = end === -1 ? text.length : end + 1;
        continue;
      }

      let i = lt + 1;
      let quote: string | null = null;
      while (i < text.length) {
        const ch = text[i];
        if (quote) {
          if (ch === quote) quote = null;
          i++;
          continue;
        }
        if (ch === '"' || ch === "'") {
          quote = ch;
        } else if (ch === '>') {
          const candidate = text.slice(lt, i + 1);
          if (
            isHtmlTag(candidate) &&
            (lt === 0 || (text[lt - 1] !== '(' && text[lt - 1] !== '\\'))
          ) {
            const token = `\u0000${placeholders.length}\u0000`;
            placeholders.push(candidate);
            result += token;
            idx = i + 1;
          } else {
            result += candidate;
            idx = i + 1;
          }
          break;
        }
        i++;
      }
      if (i >= text.length) {
        result += text.slice(lt);
        break;
      }
    }
    text = result;
  }

  // handle backslash escapes by storing them as placeholders
  text = text.replace(
    /\\([!"#$%&'()*+,\-.\/\:;<=>?@\[\]\\^_`{|}~])/g,
    (_, p1) => {
      const token = `\u0001${placeholders.length}\u0001`;
      placeholders.push(escapeHTML(p1));
      return token;
    },
  );

  function restoreEscapes(str: string): string {
    return str.replace(/\u0001(\d+)\u0001/g, (_, idx) => placeholders[+idx]);
  }

  function restoreEscapesForKey(str: string): string {
    return str.replace(/\u0001(\d+)\u0001/g, (_, idx) => {
      return `\\${decodeEntities(placeholders[+idx])}`;
    });
  }

  function restoreEntities(str: string): string {
    return str.replace(/\u0003(\d+)\u0003/g, (_, idx) => placeholders[+idx]);
  }

  // store character references as placeholders so that they do not affect
  // emphasis and other inline processing
  text = text.replace(/&(#x?[0-9a-f]+|[A-Za-z][A-Za-z0-9]*);/gi, (m) => {
    const token = `\u0003${placeholders.length}\u0003`;
    placeholders.push(escapeHTML(decodeEntities(m)));
    return token;
  });

  function processDirect(str: string): string {
    let out = '';
    for (let i = 0; i < str.length;) {
      let isImage = false;
      if (str[i] === '!' && str[i + 1] === '[') {
        isImage = true;
      }
      if (isImage || str[i] === '[') {
        const start = isImage ? i + 1 : i;
        let j = start + 1;
        let depth = 1;
        while (j < str.length) {
          const ch = str[j];
          if (ch === '\\') {
            j += 2;
            continue;
          }
          if (ch === '[') depth++;
          else if (ch === ']') {
            depth--;
            if (depth === 0) break;
          }
          j++;
        }
        if (depth === 0 && j + 1 < str.length && str[j + 1] === '(') {
          let k = j + 2;
          let pd = 1;
          let angle = 0;
          while (k < str.length) {
            const ch = str[k];
            if (ch === '\\') {
              k += 2;
              continue;
            }
            if (ch === '<') angle++;
            else if (ch === '>' && angle > 0) angle--;
            else if (ch === '(' && angle === 0) pd++;
            else if (ch === ')' && angle === 0) {
              pd--;
              if (pd === 0) break;
            }
            k++;
          }
          if (pd === 0) {
            const textContent = str.slice(start + 1, j);
            const inside = str.slice(j + 2, k);
            const m = inside.match(
              /^[ \t\n]*(<[^>\n]*>|[^ \t\n<>]+)(?:[ \t\n]+(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|\(((?:\\.|[^)\\])*)\)))?[ \t\n]*$/s,
            );
            const hasNested = /(^|[^!])\[[^\]]*\]\(/.test(textContent);
            if (m && (!hasNested || isImage)) {
              const hrefRaw = restoreEntities(restoreEscapes(m[1]));
              const title = m[2] || m[3] || m[4];
              const url = encodeHref(
                decodeEntities(unescapeMd(hrefRaw.replace(/^<|>$/g, ''))),
              );
              if (isImage) {
                const altProcessed = inlineToHTML(textContent, refs).replace(
                  /<img[^>]*alt="([^"]*)"[^>]*>/g,
                  '$1',
                );
                const altPlain = altProcessed.replace(/<[^>]*>/g, '');
                let html = `<img src="${url}" alt="${escapeHTML(altPlain)}"`;
                if (title) {
                  html += ` title="${
                    escapeHTML(
                      decodeEntities(
                        unescapeMd(restoreEntities(restoreEscapes(title))),
                      ),
                    )
                  }"`;
                }
                html += ' />';
                const token = `\u0000${placeholders.length}\u0000`;
                placeholders.push(html);
                out += token;
              } else {
                const inner = inlineToHTML(textContent, refs, placeholders);
                const titleAttr = title
                  ? ` title="${
                    escapeHTML(
                      decodeEntities(
                        unescapeMd(restoreEntities(restoreEscapes(title))),
                      ),
                    )
                  }"`
                  : '';
                const token = `\u0000${placeholders.length}\u0000`;
                placeholders.push(`<a href="${url}"${titleAttr}>${inner}</a>`);
                out += token;
              }
              i = k + 1;
              continue;
            }
          }
        }
      }
      out += str[i];
      i++;
    }
    return out;
  }

  text = processDirect(text);

  // inline links with empty destination
  text = text.replace(/\[([^\]]*)\]\(\)/g, (_, textContent) => {
    const token = `\u0000${placeholders.length}\u0000`;
    const inner = inlineToHTML(textContent, refs, placeholders);
    placeholders.push(`<a href="">${inner}</a>`);
    return token;
  });

  // handle raw HTML tags that appear inside parentheses but are not part
  // of a valid link destination
  text = text.replace(/\((<[^>]+>)/g, (m, tag) => {
    if (isHtmlTag(tag)) {
      const token = `\u0000${placeholders.length}\u0000`;
      placeholders.push(tag);
      return '(' + token;
    }
    return m;
  });

  // reference-style images and links
  if (refs) {
    function processReference(str: string): string {
      let out = '';
      for (let i = 0; i < str.length;) {
        let isImage = false;
        if (str[i] === '!' && str[i + 1] === '[') isImage = true;
        if (isImage || str[i] === '[') {
          const start = isImage ? i + 1 : i;
          let j = start + 1;
          let depth = 1;
          while (j < str.length) {
            const ch = str[j];
            if (ch === '\\') {
              j += 2;
              continue;
            }
            if (ch === '[') depth++;
            else if (ch === ']') {
              depth--;
              if (depth === 0) break;
            }
            j++;
          }
          if (depth === 0) {
            const textContent = str.slice(start + 1, j);
            let k = j + 1;
            if (k < str.length && str[k] === '[') {
              let l = k + 1;
              while (l < str.length) {
                const ch = str[l];
                if (ch === '\\') {
                  l += 2;
                  continue;
                }
                if (ch === ']') break;
                l++;
              }
              if (l < str.length && str[l] === ']') {
                const labelRaw = str.slice(k + 1, l);
                const key = normalizeLabel(
                  restoreEntities(
                    restoreEscapesForKey(labelRaw || textContent),
                  ),
                );
                const def = refs!.get(key);
                if (def) {
                  if (isImage) {
                    const altProcessed = inlineToHTML(textContent, refs)
                      .replace(
                        /<img[^>]*alt="([^"]*)"[^>]*>/g,
                        '$1',
                      );
                    const altPlain = altProcessed.replace(/<[^>]*>/g, '');
                    let html = `<img src="${encodeHref(def.url)}" alt="${
                      escapeHTML(altPlain)
                    }"`;
                    if (def.title) html += ` title="${escapeHTML(def.title)}"`;
                    html += ' />';
                    const token = `\u0000${placeholders.length}\u0000`;
                    placeholders.push(html);
                    out += token;
                    i = l + 1;
                    continue;
                  } else {
                    let hasNested = /(^|[^!])\[[^\]]*\]\(|(^|[^!])\[[^\]]*\]\[/
                      .test(textContent);
                    if (!hasNested && /\u0000(\d+)\u0000/.test(textContent)) {
                      const matches = [
                        ...textContent.matchAll(/\u0000(\d+)\u0000/g),
                      ];
                      if (
                        matches.some((ma) => {
                          const ph = placeholders[+ma[1]];
                          return typeof ph === 'string' && ph.startsWith('<a ');
                        })
                      ) {
                        hasNested = true;
                      }
                    }
                    if (hasNested) {
                      // not a valid link label due to nesting
                    } else {
                      const inner = inlineToHTML(
                        textContent,
                        refs,
                        placeholders,
                      );
                      const titleAttr = def.title
                        ? ` title="${
                          escapeHTML(decodeEntities(unescapeMd(def.title)))
                        }"`
                        : '';
                      const href = encodeHref(
                        decodeEntities(unescapeMd(def.url)),
                      );
                      const token = `\u0000${placeholders.length}\u0000`;
                      placeholders.push(
                        `<a href="${href}"${titleAttr}>${inner}</a>`,
                      );
                      out += token;
                      i = l + 1;
                      continue;
                    }
                  }
                }
              }
            } else {
              const key = normalizeLabel(
                restoreEntities(restoreEscapesForKey(textContent)),
              );
              const def = refs!.get(key);
              if (def) {
                if (isImage) {
                  const altProcessed = inlineToHTML(textContent, refs).replace(
                    /<img[^>]*alt="([^"]*)"[^>]*>/g,
                    '$1',
                  );
                  const altPlain = altProcessed.replace(/<[^>]*>/g, '');
                  let html = `<img src="${encodeHref(def.url)}" alt="${
                    escapeHTML(altPlain)
                  }"`;
                  if (def.title) html += ` title="${escapeHTML(def.title)}"`;
                  html += ' />';
                  const token = `\u0000${placeholders.length}\u0000`;
                  placeholders.push(html);
                  out += token;
                  i = j + 1;
                  continue;
                } else {
                  let hasNested = /(^|[^!])\[[^\]]*\]\(|(^|[^!])\[[^\]]*\]\[/
                    .test(textContent);
                  if (!hasNested && /\u0000(\d+)\u0000/.test(textContent)) {
                    const matches = [
                      ...textContent.matchAll(/\u0000(\d+)\u0000/g),
                    ];
                    if (
                      matches.some((ma) => {
                        const ph = placeholders[+ma[1]];
                        return typeof ph === 'string' && ph.startsWith('<a ');
                      })
                    ) {
                      hasNested = true;
                    }
                  }
                  if (hasNested) {
                    // not a valid link label due to nesting
                  } else {
                    const inner = inlineToHTML(textContent, refs, placeholders);
                    const titleAttr = def.title
                      ? ` title="${
                        escapeHTML(decodeEntities(unescapeMd(def.title)))
                      }"`
                      : '';
                    const href = encodeHref(
                      decodeEntities(unescapeMd(def.url)),
                    );
                    const token = `\u0000${placeholders.length}\u0000`;
                    placeholders.push(
                      `<a href="${href}"${titleAttr}>${inner}</a>`,
                    );
                    out += token;
                    i = j + 1;
                    continue;
                  }
                }
              }
            }
          }
        }
        out += str[i];
        i++;
      }
      return out;
    }

    text = processReference(text);
  }

  let out = escapeHTML(text);

  // backslash at line end creates hard line break
  out = out.replace(/\\\n/g, '<br />\n');

  out = applyEmphasis(out);

  // trim spaces before emphasis at line start
  out = out.replace(/(^|\n)\s+(?=<(?:em|strong)>)/g, '$1');

  if (refs) {
    // reference link placeholders are already handled
  }
  out = out.replace(/ {2,}\n(?!$)/g, '<br />\n');
  out = out.replace(/ +(?=\n)/g, '');
  out = out.replace(/ +$/g, '');

  // restore placeholders
  for (let i = 0; i < 3; i++) {
    out = out.replace(/\u0000(\d+)\u0000/g, (_, idx) => placeholders[+idx]);
    out = out.replace(/\u0001(\d+)\u0001/g, (_, idx) => placeholders[+idx]);
    out = out.replace(/\u0002(\d+)\u0002/g, (_, idx) => placeholders[+idx]);
    out = out.replace(/\u0003(\d+)\u0003/g, (_, idx) => placeholders[+idx]);
    if (
      !/\u0000\d+\u0000|\u0001\d+\u0001|\u0002\d+\u0002|\u0003\d+\u0003/.test(
        out,
      )
    ) {
      break;
    }
  }

  return out;
}

export function applyEmphasisOnce(text: string): string {
  type Delim = {
    char: string;
    count: number;
    canOpen: boolean;
    canClose: boolean;
    idx: number;
  };

  function isWhitespace(ch: string): boolean {
    return ch === '' || /\s/.test(ch);
  }

  function isPunctuation(ch: string): boolean {
    if (ch === '<' || ch === '>') return false;
    return /[\p{P}\p{S}]/u.test(ch);
  }

  const tokens: { text: string; delim?: Delim }[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '*' || ch === '_') {
      let j = i;
      while (j < text.length && text[j] === ch) j++;
      const count = j - i;
      const prev = i === 0 ? '' : text[i - 1];
      const next = j >= text.length ? '' : text[j];
      const lf = !isWhitespace(next) && (!isPunctuation(next) ||
        isWhitespace(prev) || isPunctuation(prev));
      const rf = !isWhitespace(prev) && (!isPunctuation(prev) ||
        isWhitespace(next) || isPunctuation(next));
      let canOpen, canClose;
      if (ch === '*') {
        canOpen = lf;
        canClose = rf;
      } else {
        canOpen = lf && (!rf || isPunctuation(prev));
        canClose = rf && (!lf || isPunctuation(next));
      }
      tokens.push({
        text: text.slice(i, j),
        delim: { char: ch, count, canOpen, canClose, idx: tokens.length },
      });
      i = j;
    } else {
      tokens.push({ text: ch });
      i++;
    }
  }

  const stack: Delim[] = [];
  for (let idx = 0; idx < tokens.length; idx++) {
    const t = tokens[idx];
    if (!t.delim) continue;
    const d = t.delim;
    if (d.canClose) {
      let openerIndex = -1;
      for (let j = stack.length - 1; j >= 0; j--) {
        const op = stack[j];
        if (op.char !== d.char) continue;
        if (!op.canOpen) continue;
        if (
          (op.canClose || d.canOpen) && ((op.count + d.count) % 3 === 0) &&
          (op.count % 3 !== 0 || d.count % 3 !== 0)
        ) {
          continue;
        }
        openerIndex = j;
        break;
      }
      if (openerIndex !== -1) {
        const opener = stack[openerIndex];
        stack.splice(openerIndex);
        // inner delimiters between opener and closer lose their ability to
        // form emphasis, per CommonMark rule 15
        for (let k = opener.idx + 1; k < idx; k++) {
          const tok = tokens[k];
          if (tok.delim) {
            tok.delim.canOpen = false;
            tok.delim.canClose = false;
          }
        }
        const useStrong = d.count >= 2 && opener.count >= 2 ? 2 : 1;
        opener.count -= useStrong;
        d.count -= useStrong;
        tokens[opener.idx].text = useStrong === 2 ? '<strong>' : '<em>';
        tokens[idx].text = useStrong === 2 ? '</strong>' : '</em>';
        if (opener.count > 0) {
          // leftover opening delimiters should appear before the opening tag
          tokens.splice(opener.idx, 0, {
            text: opener.char.repeat(opener.count),
          });
          idx++; // adjust index as we inserted before opener
        }
        if (d.count > 0) {
          // leftover closing delimiters should appear after the closing tag
          tokens.splice(idx + 1, 0, { text: d.char.repeat(d.count) });
          idx++; // skip over inserted text
        }
        continue;
      }
    }
    if (d.canOpen) {
      stack.push(d);
    }
  }

  return tokens.map((t) => t.text).join('');
}

export function applyEmphasis(text: string): string {
  let prev = '';
  let curr = text;
  while (curr !== prev) {
    prev = curr;
    const placeholders: string[] = [];
    curr = curr.replace(/<(?:em|strong)>[\s\S]*?<\/(?:em|strong)>/g, (seg) => {
      return seg.replace(/[*_]/g, (ch) => {
        const token = `\u0004${placeholders.length}\u0004`;
        placeholders.push(ch);
        return token;
      });
    });
    curr = applyEmphasisOnce(curr);
    curr = curr.replace(/\u0004(\d+)\u0004/g, (_, idx) => placeholders[+idx]);
  }
  return curr;
}
