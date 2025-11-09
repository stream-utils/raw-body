'use strict'
const neostandard = require('neostandard')

module.exports = [
  ...neostandard({
    env: ['mocha'],
  }),
  {
    rules: {
      'object-shorthand': ['off'], // Compatibility with older code
      'no-var': ['off'], // Compatibility with older code
      'no-redeclare': ['off'], // Because we use var for compatibility with node 0.10
    }
  }
]
