import fg from 'fast-glob'
import { join } from 'node:path'
import fs from 'node:fs'
import assert from 'node:assert'
import Functions from './Functions.js'

function createTempProject(spec, rootDir = fs.mkdtempSync(join(process.cwd(), '.test_autogen', 'tempProject'))) {
  for (const [path, content] of Object.entries(spec)) {
    if (content instanceof Object) {
      const subPath = join(rootDir, path)
      fs.mkdirSync(subPath, { recursive: true })
      createTempProject(content, subPath)
    } else {
      fs.writeFileSync(join(rootDir, path), content, { encoding: 'utf8' })
    }
  }
  return rootDir
}

const bananaTest = `import assert from 'node:assert'
import { describe, it } from 'node:test'

describe('banana', function() {
  it('fills you up', function() {
    assert(true)
  })

  it('makes you feel good', function() {
    assert(true)
  })
})
`

const appleTest = `import assert from 'node:assert'
import { describe, it } from 'node:test'

describe('apple', function() {
  it('cheers" you up', function() {
    assert(true)
  })
})
`

describe('Functions', function() {
  this.timeout(5000)

  let functions, tempProjectPath

  beforeEach(function() {
    const dirs = fg.globSync(`${process.cwd()}/.test_autogen/*`, { onlyFiles: false })
    dirs.forEach(dir => fs.rmSync(dir, { recursive: true, force: true }))
  })

  afterEach(function() {
    functions.dispose()
  })

  describe('#definition', function() {
    beforeEach(function() {
      // add tsconfig.json for lsp to properly work (e.g. for references to return refs from unopened files)
      tempProjectPath = createTempProject({
        'tsconfig.json': fs.readFileSync(join(process.cwd(), 'tsconfig.json'), { encoding: 'utf8' }),
        'index.js': `import Banana from './lib/banana.js'\n\nconst banana = new Banana()\n`,
        lib: {
          'banana.js': `import fs from 'node:fs'\n\nexport default class Banana {}\n`,
        }
      })
      functions = new Functions(tempProjectPath)
    })

    it('returns symbol definition', async function() {
      const definition = await functions.definition({ file: 'index.js', line: 2, character: 21 })

      assert.deepStrictEqual(definition, {
        file: './lib/banana.js',
        line: 2,
        character: 21
      })
    })
  })

  describe('#references', function() {
    beforeEach(function() {
      // add tsconfig.json for lsp to properly work (e.g. for references to return refs from unopened files)
      tempProjectPath = createTempProject({
        'tsconfig.json': fs.readFileSync(join(process.cwd(), 'tsconfig.json'), { encoding: 'utf8' }),
        'index.js': `import Banana from './lib/banana.js'\n\nconst banana = new Banana()\n`,
        lib: {
          'banana.js': `import fs from 'node:fs'\n\nexport default class Banana {}\n`,
        }
      })
      functions = new Functions(tempProjectPath)
    })

    it('returns references to symbol', async function() {
      const references = await functions.references({ file: 'lib/banana.js', line: 2, character: 21 })

      assert.deepStrictEqual(references, [
        { file: './lib/banana.js', line: 2, character: 21 },
        { file: './index.js', line: 0, character: 7 },
        { file: './index.js', line: 2, character: 19 },
      ])
    })
  })

  describe('#applyWorkspaceEdit', function() {
    beforeEach(function() {
      tempProjectPath = createTempProject({
        lib: {
          'banana.js': `import fs from 'node:fs'\n\nexport default class Banana {}\n`,
        }
      })
      functions = new Functions(tempProjectPath)
    })

    it('creates file with content', async function() {
      await functions.applyWorkspaceEdit({
        changes: [
          {
            create: {
              fileName: './lib/apple.js',
              content: 'export default class Apple {}'
            }
          }
        ]
      })

      const newFilePath = join(tempProjectPath, 'lib', 'apple.js')

      assert(fs.existsSync(newFilePath))
      assert.deepStrictEqual(
        fs.readFileSync(newFilePath, { encoding: 'utf8' }),
        'export default class Apple {}\n'
      )
    })

    it('removes file', async function() {
      const filePath = join(tempProjectPath, 'lib', 'banana.js')
      assert(fs.existsSync(filePath))

      await functions.applyWorkspaceEdit({
        changes: [
          {
            delete: {
              fileName: './lib/banana.js'
            }
          }
        ]
      })

      assert(!fs.existsSync(filePath))
    })

    it('renames file', async function() {
      const oldFilePath = join(tempProjectPath, 'lib', 'banana.js')
      const newFilePath = join(tempProjectPath, 'lib', 'apple.js')

      assert(fs.existsSync(oldFilePath))
      assert(!fs.existsSync(newFilePath))

      await functions.applyWorkspaceEdit({
        changes: [
          {
            rename: {
              existingFileName: './lib/banana.js',
              newFileName: './lib/apple.js'
            }
          }
        ]
      })

      assert(!fs.existsSync(oldFilePath))
      assert(fs.existsSync(newFilePath))
    })

    it('modifies file', async function() {
      const filePath = join(tempProjectPath, 'lib', 'banana.js')
      assert(fs.existsSync(filePath))

      await functions.applyWorkspaceEdit({
        changes: [
          {
            modify: {
              fileName: './lib/banana.js',
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 }
              },
              newText: "import path from 'node:path'\n"
            }
          }
        ]
      })

      assert.deepStrictEqual(
        fs.readFileSync(filePath, { encoding: 'utf8' }),
        "import path from 'node:path'\nimport fs from 'node:fs'\n\nexport default class Banana {}\n"
      )
    })

    it('throws error if `change` key is not in [create, delete, rename, modify]', async function() {
      await assert.rejects(
        functions.applyWorkspaceEdit({
          changes: [
            { translate: {file: './lib/banana.js'} }
          ]
        }),
        {
          name: 'Error',
          message: 'Unknown change type: translate. Expected one of: create, delete, rename, modify.'
        }
      )
    })
  })

  describe('#runTests', function() {
    beforeEach(function() {
      tempProjectPath = createTempProject({
        '.coderat.config.json': '{ "testCommand": "node --test --test-reporter=dot", "nearestTestOption": "--test-name-pattern" }',
        lib: {
          'banana.test.js': bananaTest,
          'apple.test.js': appleTest,
        }
      })
      functions = new Functions(tempProjectPath)
    })

    it('runs all tests when called without parameters', async function() {
      const results = await functions.runTests()

      assert.deepStrictEqual(results, '.....')
    })

    it('runs a single test file', async function() {
      const results = await functions.runTests({ fileName: './lib/banana.test.js' })

      assert.deepStrictEqual(results, '...')
    })

    it('runs a single test by name', async function() {
      const results = await functions.runTests({ fileName: './lib/apple.test.js', testName: 'cheers" you up' })
      assert.deepStrictEqual(results, '..')
    })

    context('when tests fail', function() {
      beforeEach(function() {
        const failingTest = `import assert from 'node:assert'
          import { describe, it } from 'node:test'
          describe('something', function() {
            it('fails', function() {
              assert(false)
            })
          })
        `

        tempProjectPath = createTempProject({
          '.coderat.config.json': '{ "testCommand": "node --test --test-reporter=dot" }',
          lib: {
            'banana.test.js': failingTest,
            'apple.test.js': bananaTest,
          }
        })
        functions = new Functions(tempProjectPath)
      })

      it('reports failures', async function() {
        await assert.rejects(
          functions.runTests(),
          {
            name: 'Error',
            message: '...XX'
          }
        )
      })
    })
  })
})
