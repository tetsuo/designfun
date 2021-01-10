const os = require('os')
const fs = require('fs')
const path = require('path')
const toposort = require('toposort')
const depsSort = require('deps-sort')
const crypto = require('crypto')
const babelify = require('babelify')
const moduleDeps = require('module-deps')
const collect = require('stream-collector')

function onresolve(cb) {
  return (er, deps) => {
    if (er) {
      return cb(er)
    }

    if (!deps.length) {
      return cb(new Error('could not resolve deps (len=0)'))
    } else if (deps.length === 1) {
      return cb(null, deps)
    }

    const sorter = depsSort({ dedupe: false, index: true })

    collect(sorter, (er, deps) => {
      if (er) {
        return cb(new Error('could not sort modules: ' + er.message))
      }

      const graph = []
      deps.forEach(d =>
        Object.values(d.deps).forEach(dep => {
          graph.push([d.file, dep])
        })
      )

      const sortedDeps = toposort(graph)
        .reverse()
        .map(d => deps[deps.findIndex(el => el.id === d)])

      sortedDeps.splice(
        sortedDeps.findIndex(d => d.entry === true),
        1
      )

      cb(null, sortedDeps)
    })

    for (let i = 0; i < deps.length; ++i) {
      sorter.write(deps[i])
    }

    sorter.end()
  }
}

module.exports = (files, babelifyOptions, cb) => {
  if (!files.length) {
    return cb(new Error('No files found'))
  }

  const resolver = moduleDeps({
    transform: [[babelify, babelifyOptions]]
  })

  const entryFile = path.join(os.tmpdir(), 'list-dependencies-' + crypto.randomBytes(24).toString('hex') + '.js')

  collect(
    resolver,
    onresolve((er, res) =>
      er
        ? cb(er)
        : fs.unlink(entryFile, er =>
            er ? cb(new Error('error while removing temporary module entry file: ' + entryFile)) : cb(null, res)
          )
    )
  )

  fs.writeFile(entryFile, files.map(file => `require('${file}');`).join('\n'), er =>
    er
      ? cb(new Error('error while writing temporary module entry file: ' + entryFile))
      : resolver.end({ file: entryFile })
  )
}
