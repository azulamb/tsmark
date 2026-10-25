import {
  convertToHTML,
  parse,
  renderDOM,
  renderHTML,
  toHTML,
} from './browser.mod.ts';

/** Runtime API exposed by the browser bundle. */
const api = Object.freeze({
  parse,
  renderHTML,
  toHTML,
  convertToHTML,
  renderDOM,
});

declare global {
  var tsmark: typeof api;
}

globalThis.tsmark = api;
