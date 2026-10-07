/* eslint-disable @typescript-eslint/no-require-imports */
const { createRequire } = require('node:module');

const requireFromPuppeteer = createRequire(
  require.resolve('puppeteer/package.json'),
);

module.exports = requireFromPuppeteer('puppeteer');
