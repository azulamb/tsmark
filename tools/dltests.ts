const url = 'https://spec.commonmark.org/';

const html = await fetch(url).then((response) => {
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.text();
});

const match = html.match(
  /href="([0-9\.]+\/spec.json)" title="JSON test cases">test cases<\/a>/,
);
if (!match) {
  throw new Error('Could not find the test cases URL in the HTML');
}

const testsUrl = new URL(match[1], url).href;
console.log(`Tests URL: ${testsUrl}`);

const testJSON = await fetch(testsUrl).then((response) => {
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.text();
});

const saveFilePath = new URL(import.meta.resolve('../tests/spec.json'));
console.log(`Download: ${saveFilePath}`);

Deno.writeTextFileSync(saveFilePath, testJSON);
