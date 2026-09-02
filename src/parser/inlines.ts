import type { InlineNode } from '../ast.ts';
import { decodeEntities, normalizeLabel, unescapeMd } from '../utils.ts';

/** A link-reference definition collected by the block parser. */
export interface ReferenceDefinition {
  readonly destination: string;
  readonly title: string | null;
}

const ESCAPABLE = /[!"#$%&'()*+,\-.\/:;<=>?@[\\\]^_`{|}~]/;
const ENTITY =
  /^&(?:#[0-9]{1,7}|#[xX][0-9A-Fa-f]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/;
const URI_AUTOLINK = /^[A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>\s]*/;
const EMAIL_AUTOLINK =
  /^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;

interface Delimiter {
  readonly type: 'delimiter';
  readonly marker: '*' | '_';
  count: number;
  readonly canOpen: boolean;
  readonly canClose: boolean;
}

type Item = InlineNode | Delimiter;

function isWhitespace(value: string): boolean {
  return value === '' || /\s/u.test(value);
}

function isPunctuation(value: string): boolean {
  return value !== '' && /[\p{P}\p{S}]/u.test(value);
}

function text(value: string): InlineNode {
  return { type: 'text', value };
}

function append(items: Item[], node: InlineNode): void {
  const previous = items.at(-1);
  if (node.type === 'text' && previous?.type === 'text') {
    items[items.length - 1] = text(previous.value + node.value);
  } else if (node.type !== 'text' || node.value !== '') {
    items.push(node);
  }
}

function decode(value: string): string {
  return decodeEntities(unescapeMd(value));
}

function rawHtmlAt(source: string, offset: number): string | null {
  const rest = source.slice(offset);
  if (rest.startsWith('<!--->')) return '<!--->';
  if (rest.startsWith('<!-->')) return '<!-->';
  const patterns = [
    /^<!--[\s\S]*?-->/,
    /^<\?[\s\S]*?\?>/,
    /^<!\[CDATA\[[\s\S]*?\]\]>/,
    /^<![A-Z]+(?:\s+[^>]*)?>/,
    /^<\/[A-Za-z][A-Za-z0-9-]*\s*>/,
    /^<[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][A-Za-z0-9_.:-]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*\/?>/,
  ];
  for (const pattern of patterns) {
    const match = rest.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function closingBracket(source: string, open: number): number {
  let depth = 0;
  for (let i = open + 1; i < source.length; i++) {
    if (source[i] === '\\') {
      i++;
    } else if (source[i] === '`') {
      let runEnd = i;
      while (source[runEnd] === '`') runEnd++;
      const length = runEnd - i;
      let search = runEnd;
      while (search < source.length) {
        const next = source.indexOf('`', search);
        if (next < 0) break;
        let end = next;
        while (source[end] === '`') end++;
        if (end - next === length) {
          i = end - 1;
          break;
        }
        search = end;
      }
    } else if (source[i] === '<') {
      const raw = rawHtmlAt(source, i);
      const end = source.indexOf('>', i + 1);
      const body = end < 0 ? '' : source.slice(i + 1, end);
      const autolink = end >= 0 &&
        ((URI_AUTOLINK.test(body) && body.match(URI_AUTOLINK)?.[0] === body) ||
          EMAIL_AUTOLINK.test(body));
      if (raw !== null) i += raw.length - 1;
      else if (autolink) i = end;
    } else if (source[i] === '[') {
      depth++;
    } else if (source[i] === ']') {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

interface LinkTarget {
  readonly destination: string;
  readonly title: string | null;
  readonly end: number;
}

function parseInlineTarget(source: string, start: number): LinkTarget | null {
  if (source[start] !== '(') return null;
  let i = start + 1;
  while (source[i] === ' ' || source[i] === '\t' || source[i] === '\n') i++;

  let destination = '';
  if (source[i] === '<') {
    const begin = ++i;
    while (i < source.length && source[i] !== '>') {
      if (source[i] === '\n' || source[i] === '<') return null;
      if (source[i] === '\\' && i + 1 < source.length) i += 2;
      else i++;
    }
    if (source[i] !== '>') return null;
    destination = source.slice(begin, i++);
  } else {
    const begin = i;
    let depth = 0;
    while (i < source.length) {
      const character = source[i];
      if (character === '\\' && i + 1 < source.length) {
        i += 2;
      } else if (character === '(') {
        if (++depth > 32) return null;
        i++;
      } else if (character === ')') {
        if (depth === 0) break;
        depth--;
        i++;
      } else if (/[ \t\n\r]|[<>]/u.test(character)) {
        break;
      } else {
        i++;
      }
    }
    destination = source.slice(begin, i);
  }

  const destinationEnd = i;
  let whitespace = 0;
  while (source[i] === ' ' || source[i] === '\t' || source[i] === '\n') {
    whitespace++;
    i++;
  }
  let title: string | null = null;
  if (
    whitespace > 0 &&
    (source[i] === '"' || source[i] === "'" || source[i] === '(')
  ) {
    const opener = source[i++];
    const closer = opener === '(' ? ')' : opener;
    const begin = i;
    while (i < source.length && source[i] !== closer) {
      if (source[i] === '\\' && i + 1 < source.length) i += 2;
      else if (opener === '(' && source[i] === '(') return null;
      else i++;
    }
    if (source[i] !== closer) return null;
    title = decode(source.slice(begin, i++));
    while (source[i] === ' ' || source[i] === '\t' || source[i] === '\n') i++;
  } else {
    i = destinationEnd;
  }
  if (source[i] !== ')') return null;
  return { destination: decode(destination), title, end: i + 1 };
}

function referenceTarget(
  source: string,
  close: number,
  labelSource: string,
  references: ReadonlyMap<string, ReferenceDefinition>,
): LinkTarget | null {
  let end = close + 1;
  let lookup = labelSource;
  if (source[end] === '[') {
    const labelEnd = closingBracket(source, end);
    if (labelEnd < 0) return null;
    const explicit = source.slice(end + 1, labelEnd);
    if (explicit.length > 999) return null;
    lookup = explicit === '' ? labelSource : explicit;
    end = labelEnd + 1;
  }
  const definition = references.get(normalizeLabel(lookup));
  if (!definition) return null;
  return { ...definition, end };
}

function resolveEmphasis(items: Item[]): InlineNode[] {
  let changed = true;
  while (changed) {
    changed = false;
    for (let closerIndex = 0; closerIndex < items.length; closerIndex++) {
      const closer = items[closerIndex];
      if (closer.type !== 'delimiter' || !closer.canClose) continue;
      for (let openerIndex = closerIndex - 1; openerIndex >= 0; openerIndex--) {
        const opener = items[openerIndex];
        if (
          opener.type !== 'delimiter' || !opener.canOpen ||
          opener.marker !== closer.marker
        ) continue;
        if (
          (opener.canClose || closer.canOpen) &&
          (opener.count + closer.count) % 3 === 0 &&
          (opener.count % 3 !== 0 || closer.count % 3 !== 0)
        ) continue;

        const count = opener.count >= 2 && closer.count >= 2 ? 2 : 1;
        const children = materialize(items.slice(openerIndex + 1, closerIndex));
        const wrapper: InlineNode = count === 2
          ? { type: 'strong', children }
          : { type: 'emphasis', children };
        opener.count -= count;
        closer.count -= count;
        const replacement: Item[] = [];
        if (opener.count > 0) replacement.push(opener);
        replacement.push(wrapper);
        if (closer.count > 0) replacement.push(closer);
        items.splice(
          openerIndex,
          closerIndex - openerIndex + 1,
          ...replacement,
        );
        changed = true;
        break;
      }
      if (changed) break;
    }
  }
  return materialize(items);
}

function materialize(items: readonly Item[]): InlineNode[] {
  const result: InlineNode[] = [];
  for (const item of items) {
    append(
      result,
      item.type === 'delimiter' ? text(item.marker.repeat(item.count)) : item,
    );
  }
  return result;
}

function containsLink(nodes: readonly InlineNode[]): boolean {
  return nodes.some((node) => {
    switch (node.type) {
      case 'link':
        return true;
      case 'emphasis':
      case 'strong':
        return containsLink(node.children);
      case 'image':
        return containsLink(node.description);
      default:
        return false;
    }
  });
}

function parse(
  source: string,
  references: ReadonlyMap<string, ReferenceDefinition>,
  allowLinks: boolean,
): InlineNode[] {
  const items: Item[] = [];
  for (let i = 0; i < source.length;) {
    const character = source[i];

    if (character === '\\') {
      if (source[i + 1] === '\n') {
        items.push({ type: 'hardBreak' });
        i += 2;
      } else if (ESCAPABLE.test(source[i + 1] ?? '')) {
        append(items, text(source[i + 1]));
        i += 2;
      } else {
        append(items, text('\\'));
        i++;
      }
      continue;
    }

    if (character === '`') {
      let runEnd = i;
      while (source[runEnd] === '`') runEnd++;
      const run = runEnd - i;
      let search = runEnd;
      let found = -1;
      while (search < source.length) {
        const next = source.indexOf('`', search);
        if (next < 0) break;
        let end = next;
        while (source[end] === '`') end++;
        if (end - next === run) {
          found = next;
          break;
        }
        search = end;
      }
      if (found >= 0) {
        let value = source.slice(runEnd, found).replace(/\n/g, ' ');
        if (
          value.startsWith(' ') && value.endsWith(' ') && /[^ ]/.test(value)
        ) {
          value = value.slice(1, -1);
        }
        items.push({ type: 'code', value });
        i = found + run;
      } else {
        append(items, text('`'.repeat(run)));
        i = runEnd;
      }
      continue;
    }

    if (character === '&') {
      const match = source.slice(i).match(ENTITY);
      if (match) {
        append(items, text(decodeEntities(match[0])));
        i += match[0].length;
        continue;
      }
    }

    if (character === '<') {
      const end = source.indexOf('>', i + 1);
      if (end >= 0) {
        const body = source.slice(i + 1, end);
        if (URI_AUTOLINK.test(body) && body.match(URI_AUTOLINK)?.[0] === body) {
          items.push({
            type: 'link',
            destination: body,
            title: null,
            children: [text(body)],
          });
          i = end + 1;
          continue;
        }
        if (EMAIL_AUTOLINK.test(body)) {
          items.push({
            type: 'link',
            destination: `mailto:${body}`,
            title: null,
            children: [text(body)],
          });
          i = end + 1;
          continue;
        }
      }
      const html = rawHtmlAt(source, i);
      if (html !== null) {
        items.push({ type: 'htmlInline', value: html });
        i += html.length;
        continue;
      }
    }

    const image = character === '!' && source[i + 1] === '[';
    if ((allowLinks && character === '[') || image) {
      const open = image ? i + 1 : i;
      const close = closingBracket(source, open);
      if (close >= 0) {
        const label = source.slice(open + 1, close);
        const direct = parseInlineTarget(source, close + 1);
        const target = direct ??
          referenceTarget(source, close, label, references);
        const nested = !image && containsLink(parse(label, references, true));
        if (target && !nested) {
          const children = parse(label, references, image);
          if (image) {
            items.push({
              type: 'image',
              destination: target.destination,
              title: target.title,
              description: children,
            });
          } else {
            items.push({
              type: 'link',
              destination: target.destination,
              title: target.title,
              children,
            });
          }
          i = target.end;
          continue;
        }
      }
    }

    if (character === '*' || character === '_') {
      let end = i;
      while (source[end] === character) end++;
      const previous = i === 0 ? '' : source[i - 1];
      const next = end === source.length ? '' : source[end];
      const leftFlanking = !isWhitespace(next) &&
        (!isPunctuation(next) || isWhitespace(previous) ||
          isPunctuation(previous));
      const rightFlanking = !isWhitespace(previous) &&
        (!isPunctuation(previous) || isWhitespace(next) || isPunctuation(next));
      items.push({
        type: 'delimiter',
        marker: character,
        count: end - i,
        canOpen: character === '*'
          ? leftFlanking
          : leftFlanking && (!rightFlanking || isPunctuation(previous)),
        canClose: character === '*'
          ? rightFlanking
          : rightFlanking && (!leftFlanking || isPunctuation(next)),
      });
      i = end;
      continue;
    }

    if (character === '\n') {
      const previous = items.at(-1);
      if (previous?.type === 'text') {
        const spaces = previous.value.match(/ +$/)?.[0].length ?? 0;
        if (spaces > 0) {
          items[items.length - 1] = text(previous.value.slice(0, -spaces));
        }
        items.push({ type: spaces >= 2 ? 'hardBreak' : 'softBreak' });
      } else {
        items.push({ type: 'softBreak' });
      }
      i++;
      continue;
    }

    append(items, text(character));
    i++;
  }
  const last = items.at(-1);
  if (last?.type === 'text') {
    const trimmed = last.value.replace(/ +$/, '');
    if (trimmed === '') items.pop();
    else items[items.length - 1] = text(trimmed);
  }
  return resolveEmphasis(items);
}

/** Parse CommonMark inline content into renderer-independent semantic nodes. */
export function parseInlines(
  source: string,
  references: ReadonlyMap<string, ReferenceDefinition>,
): readonly InlineNode[] {
  return parse(source, references, true);
}
