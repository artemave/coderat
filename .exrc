let g:vigun_mappings = [
      \ {
      \   'pattern': '.test.js$',
      \   'all': './node_modules/.bin/mocha #{file}',
      \   'nearest': './node_modules/.bin/mocha --fgrep #{nearest_test} #{file}',
      \ },
      \]
