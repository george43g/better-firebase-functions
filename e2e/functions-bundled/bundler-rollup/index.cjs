const smoke = require('./lib/triggers/smoke.func.js');

module.exports = {
  bundlerRollupSmoke: smoke.default ?? smoke,
};
