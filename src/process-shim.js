// Process shim for browser/renderer context
const processShim = {
  env: {
    NODE_ENV: 'development'
  },
  platform: 'darwin',
  type: 'renderer',
  browser: true,
  versions: {},
  nextTick: function(fn) {
    setTimeout(fn, 0);
  }
};

module.exports = processShim;
module.exports.default = processShim;