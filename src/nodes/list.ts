import type { TsmarkNode } from '../types.d.ts';
import {
  indentWidth,
  indentWidthFrom,
  LAZY,
  stripColumns,
  stripColumnsFrom,
  stripLazy,
} from '../utils.ts';

export function parseList(
  lines: string[],
  start: number,
  parseFn: (md: string) => TsmarkNode[],
): { node: TsmarkNode; next: number } | null {
  const line = lines[start];
  const stripped = stripLazy(line);

  const bulletMatch = stripped.match(/^(\s{0,3})([-+*])((?:[ \t]+.*)?)$/);
  const orderedMatch = stripped.match(
    /^(\s{0,3})(\d{1,9})([.)])((?:[ \t]+.*)?)$/,
  );
  if (
    !line.startsWith(LAZY) &&
    (bulletMatch || orderedMatch) &&
    !(/^ {0,3}(\*\s*){3,}$/.test(stripped) ||
      /^ {0,3}(-\s*){3,}$/.test(stripped) ||
      /^ {0,3}(_\s*){3,}$/.test(stripped))
  ) {
    let i = start;
    const isOrdered = Boolean(orderedMatch);
    const startNum = isOrdered ? parseInt(orderedMatch![2], 10) : undefined;
    const bulletChar = bulletMatch ? bulletMatch[2] : null;
    const delimChar = orderedMatch ? orderedMatch[3] : null;
    const items: TsmarkNode[] = [];
    while (i < lines.length) {
      const cur = stripLazy(lines[i]);
      const m = isOrdered
        ? cur.match(/^(\s{0,3})(\d{1,9})([.)])((?:[ \t]+.*)?)$/)
        : cur.match(/^(\s{0,3})([-+*])((?:[ \t]+.*)?)$/);
      if (
        !m ||
        (!isOrdered && m[2] !== bulletChar) ||
        (isOrdered && m[3] !== delimChar) ||
        /^ {0,3}(\*\s*){3,}$/.test(cur) ||
        /^ {0,3}(-\s*){3,}$/.test(cur) ||
        /^ {0,3}(_\s*){3,}$/.test(cur)
      ) {
        break;
      }
      const after = (isOrdered ? m[4] : m[3]) ?? '';
      const markerBase = indentWidth(m[1]) +
        (isOrdered ? m[2].length + 1 : 1);
      const totalSpaces = indentWidthFrom(after, markerBase);
      const spacesAfter = after.trim() === ''
        ? 1
        : totalSpaces >= 5
        ? 1
        : Math.min(totalSpaces, 4);
      const markerIndent = markerBase + spacesAfter;
      const firstLine = stripColumnsFrom(after, spacesAfter, markerBase);
      const itemLines: string[] = [firstLine];
      let itemLoose = false;
      let fence: { char: string; len: number } | null = null;
      const firstFm = firstLine.match(/^(\s*)(`{3,}|~{3,})/);
      if (firstFm) {
        fence = { char: firstFm[2][0], len: firstFm[2].length };
      }
      i++;
      let prevBlank = false;
      while (i < lines.length) {
        const ind = indentWidth(lines[i]);
        const current = stripLazy(lines[i]);
        const fm = current.match(/^(\s*)(`{3,}|~{3,})/);
        if (fm && indentWidth(fm[1]) <= 3) {
          const ch = fm[2][0];
          const len = fm[2].length;
          if (!fence) {
            fence = { char: ch, len };
          } else if (fence.char === ch && len >= fence.len) {
            fence = null;
          }
          itemLines.push(stripColumns(lines[i], markerIndent));
          i++;
          prevBlank = false;
          continue;
        }
        if (/^\s*$/.test(current)) {
          if (fence) {
            itemLines.push('');
            i++;
            prevBlank = true;
            continue;
          }
          let j = i + 1;
          while (j < lines.length && stripLazy(lines[j]).trim() === '') {
            j++;
          }
          const next = j < lines.length ? stripLazy(lines[j]) : '';
          const nextMatch = isOrdered
            ? next.match(/^(\s{0,3})(\d{1,9})([.)])((?:[ \t]+.*)?)$/)
            : next.match(/^(\s{0,3})([-+*])((?:[ \t]+.*)?)$/);
          const sameBullet = nextMatch &&
            ((!isOrdered && nextMatch[2] === bulletChar) ||
              (isOrdered && nextMatch[3] === delimChar));
          const nextInd = j < lines.length ? indentWidth(lines[j]) : -1;
          const atStart = itemLines.every((ln) => ln.trim() === '');
          if (sameBullet && nextInd - indentWidth(m[1]) <= 3) {
            itemLoose = true;
            i = j;
            break;
          }
          if (nextInd >= markerIndent + 4) {
            let k = itemLines.length - 1;
            while (k >= 0 && itemLines[k].trim() === '') {
              k--;
            }
            const prevLine = k >= 0 ? itemLines[k] : '';
            const prevBullet = isOrdered
              ? /^\s*\d+[.)]/.test(prevLine)
              : /^\s*[-+*]/.test(prevLine);
            if (!prevBullet && prevLine.trim() !== '') {
              itemLoose = true;
            }
            itemLines.push('');
            i++;
            prevBlank = true;
            continue;
          }
          if (nextInd >= markerIndent && !atStart) {
            let k2 = itemLines.length - 1;
            while (k2 >= 0 && itemLines[k2].trim() === '') {
              k2--;
            }
            const prevLine = k2 >= 0 ? itemLines[k2] : '';
            const prevBullet = isOrdered
              ? /^\s*\d+[.)]/.test(prevLine)
              : /^\s*[-+*]/.test(prevLine);
            if (!prevBullet) {
              itemLoose = true;
            }
            itemLines.push('');
            i++;
            prevBlank = true;
            continue;
          }
          break;
        } else if (ind >= markerIndent) {
          itemLines.push(stripColumns(lines[i], markerIndent));
          i++;
          prevBlank = false;
        } else if (
          !prevBlank &&
          ind < markerIndent &&
          !/^ {0,3}(?:#{1,6}(?:\s|$)|(?:\*|_|-){3,}\s*$)/.test(current) &&
          !/^(?:\s*)(`{3,}|~{3})/.test(current) &&
          !/^ {0,3}(?:\d{1,9}[.)]|[-+*])(?:\s|$)/.test(current) &&
          !/^ {0,3}>/.test(current)
        ) {
          itemLines.push(
            LAZY + stripColumns(lines[i], Math.min(ind, markerIndent)),
          );
          i++;
          prevBlank = false;
        } else {
          break;
        }
      }
      const children = parseFn(itemLines.join('\n'));
      const paraCount = children.filter((c) => c.type === 'paragraph').length;
      if (paraCount > 1) {
        itemLoose = true;
      }
      items.push({ type: 'list_item', children, loose: itemLoose });
    }
    const listLoose = items.some((it) => (it as any).loose);
    const listNode: any = {
      type: 'list',
      ordered: isOrdered,
      items,
      loose: listLoose,
    };
    if (isOrdered && startNum !== 1 && startNum !== undefined) {
      listNode.start = startNum;
    }
    return { node: listNode as TsmarkNode, next: i };
  }
  return null;
}
