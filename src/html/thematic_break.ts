import type { TsmarkNode } from '../types.d.ts';

export function thematicBreakToHTML(
  _node: TsmarkNode & { type: 'thematic_break' },
): string {
  return '<hr />';
}
