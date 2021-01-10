#!/usr/bin/env node
/* eslint-disable no-console */

const designfun = require('./lib')
const path = require('path')

const args = process.argv.slice(2)

if (!args.length) {
  console.error('usage: designfun DIR')
  process.exit(1)
}

designfun(path.resolve(args[0]), (er, doc) => {
  if (er) {
    console.error(er.message)
    process.exit(1)
  }
  console.log(JSON.stringify(doc))
})
