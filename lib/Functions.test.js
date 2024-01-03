import fg from 'fast-glob'
import { join } from 'node:path'
import fs from 'node:fs'
import { afterEach, beforeEach, describe, it } from 'node:test'
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

describe('Functions', function() {
  beforeEach(function() {
    const dirs = fg.globSync(`${process.cwd()}/.test_autogen/*`, { onlyFiles: false })
    dirs.forEach(dir => fs.rmSync(dir, { recursive: true, force: true }))

    // add tsconfig.json for lsp to properly work (e.g. for references to return refs from unopened files)
    this.tempProjectPath = createTempProject({
      'tsconfig.json': fs.readFileSync(join(process.cwd(), 'tsconfig.json'), { encoding: 'utf8' }),
      'index.js': `import Banana from './lib/banana.js'\n\nconst banana = new Banana()\n`,
      lib: {
        'banana.js': `import fs from 'node:fs'\n\nexport default class Banana {}\n`
      }
    })
    this.functions = new Functions(this.tempProjectPath)
  })

  afterEach(function() {
    this.functions.dispose()
  })

  describe('#definition', function() {
    it('returns symbol definition', async function() {
      const definition = await this.functions.definition({ file: 'index.js', line: 2, character: 21 })

      assert.deepStrictEqual(definition, {
        file: './lib/banana.js',
        line: 2,
        character: 21
      })
    })
  })

  describe('#references', function() {
    it('returns references to symbol', async function() {
      const references = await this.functions.references({ file: 'lib/banana.js', line: 2, character: 21 })

      assert.deepStrictEqual(references, [
        { file: './lib/banana.js', line: 2, character: 21 },
        { file: './index.js', line: 0, character: 7 },
        { file: './index.js', line: 2, character: 19 },
      ])
    })
  })
})
