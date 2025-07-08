import type { TsmarkNode } from '../types.d.ts';

export function parseThematicBreak(line: string): TsmarkNode | null {
  if (
    /^ {0,3}(\*\s*){3,}$/.test(line) ||
    /^ {0,3}(-\s*){3,}$/.test(line) ||
    /^ {0,3}(_\s*){3,}$/.test(line)
  ) {
    return { type: 'thematic_break' };
  }
  return null;
}
