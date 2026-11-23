const path = require('node:path');
process.env.electron_config_cache ||= path.resolve(__dirname, '../.cache/electron');
if (process.env.HTTPS_PROXY) {
  process.env.ELECTRON_GET_USE_PROXY ||= '1';
  process.env.GLOBAL_AGENT_HTTPS_PROXY ||= process.env.HTTPS_PROXY;
}
require(path.join(path.dirname(require.resolve('electron/package.json')), 'install.js'));
