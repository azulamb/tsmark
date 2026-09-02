import { parse } from './parser.ts';
import { renderHTML } from './render/html.ts';

/** Parse CommonMark and render its canonical HTML representation. */
export function toHTML(source: string): string {
  return renderHTML(parse(source));
}

/** @deprecated Use `toHTML` instead. */
export const convertToHTML = toHTML;

export { renderHTML };
