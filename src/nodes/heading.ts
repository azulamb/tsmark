import type { TsmarkNode } from '../types.d.ts';

export function parseATXHeading(line: string): TsmarkNode | null {
  const atx = line.match(/^ {0,3}(#{1,6})(.*)$/);
  if (!atx) return null;
  const level = atx[1].length;
  let rest = atx[2];
  if (rest !== '' && !/^\s/.test(rest)) {
    return null;
  }
  rest = rest.replace(/\s+$/, '');
  rest = rest.replace(/\s+#+\s*$/, '');
  rest = rest.replace(/^\s+/, '');
  const content = rest;
  return { type: 'heading', level, content };
}

export function parseSetextHeading(
  paraLines: string[],
  nextLine: string,
): TsmarkNode | null {
  if (paraLines.length === 0) return null;
  if (!/^ {0,3}([-=])+\s*$/.test(nextLine)) return null;
  const level = nextLine.trim().startsWith('=') ? 1 : 2;
  const content = paraLines.join('\n').trimEnd();
  return { type: 'heading', level, content };
}
