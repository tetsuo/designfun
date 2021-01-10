const {
  arrayGroupBy,
  recordMapWithIndex,
  arrayPartition,
  recordMap,
  arrayReduce,
  recordInsertAt,
  pipe
} = require('./function')
const parse = require('./parse')

const designFunctionType = x =>
  x.type === 'Map' || x.type === 'Reduce' || x.type === 'Lib'
    ? 'views'
    : x.type === 'Filter'
    ? 'filters'
    : x.type === 'Update'
    ? 'updates'
    : 'validate_doc_update'

const designFunctionSource = pipe(
  x => [
    x,
    `function() {\n"use strict";\n` +
      x.source
        .split('\n')
        .filter(x => !(x.startsWith('exports') || x.startsWith('"use strict"')))
        .join('\n')
  ],
  ([x, s]) =>
    x.type !== 'Lib'
      ? x.type === 'Map'
        ? s +
          `\nvar _arg0 = arguments[0]; _default(function(f) { f(_arg0); })(function(d) { Object.prototype.toString.call(d) === "[object Array]" ? emit.apply(null, d) : emit(d); });\n\n}\n`
        : x.type === 'Reduce'
        ? s +
          `\nvar _arg0 = arguments[0], _arg1 = arguments[1], _arg2 = arguments[2];\nreturn _default(function(f) { f([_arg0, _arg1, _arg2]); });\n\n}\n`
        : s + `\nreturn _default.apply(null, [].slice.call(arguments));\n\n}\n`
      : s
)

const BUILTIN_REDFUN_COMMENT = /\/\*\s*builtin:\s*(_approx_count_distinct|_count|_stats|_sum)\s*\*\//

const designFunction = x =>
  x.type === 'Lib'
    ? x
    : {
        ...x,
        ...{
          source: pipe(x => {
            if (x.type === 'Reduce') {
              const m = x.source.match(BUILTIN_REDFUN_COMMENT)
              if (m) {
                return m[1]
              }
            }
            return designFunctionSource(x)
          })(x)
        }
      }

module.exports = (dir, cb) =>
  parse(dir, (er, xs) =>
    er
      ? cb(er)
      : cb(
          null,
          pipe(
            arrayGroupBy(designFunctionType),
            recordMapWithIndex((key, value) =>
              key === 'validate_doc_update'
                ? value[0].source
                : key === 'views'
                ? pipe(
                    arrayPartition(x => x.type === 'Lib'),
                    ({ left: views, right: lib }) =>
                      pipe(
                        arrayGroupBy(x => x.name),
                        recordMap(arrayReduce({}, (b, a) => ({ ...b, ...{ [a.type.toLowerCase()]: a.source } }))),
                        recordInsertAt(
                          'lib',
                          arrayReduce({}, (b, a) => ({ ...b, ...{ [String(a.name)]: a.source } }))(lib)
                        )
                      )(views)
                  )(value)
                : pipe(
                    arrayGroupBy(x => x.name),
                    recordMap(x => x[0].source)
                  )(value)
            )
          )(xs.map(designFunction))
        )
  )
