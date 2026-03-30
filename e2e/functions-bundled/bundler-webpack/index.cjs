const smoke = require('./lib/triggers/smoke.func.js');

module.exports = {
  bundlerWebpackSmoke: smoke.default ?? smoke,
};
