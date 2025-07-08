import type { TsmarkNode } from './types.d.ts';
import { parseATXHeading } from './nodes/heading.ts';
import { parseParagraph } from './nodes/paragraph.ts';
import { parseCodeBlock } from './nodes/code_block.ts';
import { parseList } from './nodes/list.ts';
import { parseBlockquote } from './nodes/blockquote.ts';
import { parseThematicBreak } from './nodes/thematic_break.ts';
import { parseHtmlBlock } from './nodes/html.ts';
import { stripLazy } from './utils.ts';

export function parse(md: string): TsmarkNode[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const nodes: TsmarkNode[] = [];

  let i = 0;
  main: while (i < lines.length) {
    const line = lines[i];
    const stripped = stripLazy(line);

    // thematic break
    const tbNode = parseThematicBreak(stripped);
    if (tbNode) {
      nodes.push(tbNode);
      i++;
      continue;
    }

    const bqResult = parseBlockquote(lines, i, parse);
    if (bqResult) {
      nodes.push(bqResult.node);
      i = bqResult.next;
      continue;
    }

    // list (unordered or ordered)
    const listResult = parseList(lines, i, parse);
    if (listResult) {
      nodes.push(listResult.node);
      i = listResult.next;
      continue;
    }

    const codeResult = parseCodeBlock(lines, i);
    if (codeResult) {
      nodes.push(codeResult.node);
      i = codeResult.next;
      continue;
    }

    // ATX heading
    const atxNode = parseATXHeading(stripped);
    if (atxNode) {
      nodes.push(atxNode);
      i++;
      continue;
    }

    // Setext heading will be handled together with paragraph parsing

    // HTML block
    {
      const htmlResult = parseHtmlBlock(lines, i);
      if (htmlResult) {
        nodes.push(htmlResult.node);
        i = htmlResult.next;
        continue;
      }
    }

    // paragraph and setext heading
    if (stripped.trim() !== '') {
      const result = parseParagraph(lines, i);
      if (result) {
        nodes.push(result.node);
        i = result.next;
        continue;
      }
    }

    // blank line
    i++;
  }

  return nodes;
}
