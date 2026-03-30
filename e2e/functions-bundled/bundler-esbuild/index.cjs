const smoke = require('./lib/triggers/smoke.func.js');

module.exports = {
  bundlerEsbuildSmoke: smoke.default ?? smoke,
};
