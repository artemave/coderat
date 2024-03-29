import fs from 'node:fs'
import Shell from 'meshell'
import { relative } from 'node:path'
import { encode, decode } from 'msgpack-lite'
import { configPath, log } from './constants.js'
import { spawn } from 'node:child_process'
import assert from 'node:assert'
import path from 'node:path'
import { functionSchemas } from './functionSchemas.js'
import { Validator } from '@cfworker/json-schema'

/**
 * @param {{ (): Promise<any>; (): Promise<{ file: string; line: any; character: any; }>; (): any; }} fn
 */
export async function retryUntil(fn, { timeout, interval } = {}) {
  try {
    return await fn()
  } catch (e) {
    if (e.name === 'AssertionError') {
      if (timeout <= 0) {
        throw e
      }

      await new Promise((resolve) => setTimeout(resolve, interval))

      return retryUntil(fn, { timeout: timeout - interval, interval })
    }
  }
}

export default class Functions {
  #requestId = 0
  #cwd
  #timeout
  #_nvim
  #rpcJobs = {}

  constructor({ cwd = process.cwd(), timeout = 3000 } = {}) {
    this.#cwd = cwd
    this.#timeout = timeout
  }

  get #nvim() {
    if (!this.#_nvim) {
      this.#_nvim = spawn(
        'nvim',
        ['--headless', '--embed'],
        { cwd: this.#cwd }
      )
      this.#_nvim.stdout.setEncoding('binary')

      this.#_nvim.stdout.on('data', (/** @type {WithImplicitCoercion<string> | { [Symbol.toPrimitive](hint: "string"): string; }} */ data) => {
        const [_, responseId, error, result] = decode(Buffer.from(data, 'binary'))
        log('received: %o', { responseId, error, result })

        if (this.#rpcJobs[responseId]) {
          const { resolve, reject } = this.#rpcJobs[responseId]
          delete this.#rpcJobs[responseId]

          if (error) {
            reject(new Error(error))
          } else {
            resolve(result)
          }
        }
      })
    }

    return this.#_nvim
  }

  dispose() {
    if (this.#_nvim) {
      this.#nvim.kill(9)
    }
  }

  readFile({ fileName }) {
    validateSchema('readFile', arguments[0])
    try {
      return fs.readFileSync(path.join(this.#cwd, fileName), { encoding: 'utf-8' })
    } catch (e) {
      if (e.code === 'ENOENT') {
        throw new Error(`File "${fileName}" does not exist.`)
      }
      throw e
    }
  }

  #renderReferencesLua({ file, line, character }) {
    return `
      local function references()
        local params = {
          position = {
            character = ${character},
            line = ${line}
          },
          textDocument = {
            uri = "file://${path.join(this.#cwd, file)}"
          },
          context = {
            includeDeclaration = true
          }
        }

        return vim.lsp.buf_request_sync(
          0,
          'textDocument/references',
          params,
          2000
        )
      end

      print(vim.json.encode(references()))\n`
  }

  async references({ file, line, character }) {
    validateSchema('references', arguments[0])
    this.#validateFile(file)

    await this.#sendRpcRequest('nvim_cmd', [{ cmd: 'edit', args: [path.join(this.#cwd, file)] }, {}])

    const luaCode = this.#renderReferencesLua({ file, line, character })

    return retryUntil(async () => {
      const { output: resultString } = await this.#sendRpcRequest('nvim_exec2', [`lua << EOF\n${luaCode}EOF`, { output: true }])

      const { result } = JSON.parse(resultString).filter(Boolean)[0]

      assert(result.length > 1, `Failed to get references from lsp: ${JSON.stringify({ file, line, character })}`)

      return result.map(({ uri, range }) => {
        return {
          file: './' + relative(this.#cwd, uri.replace('file://', '')),
          line: range.start.line,
          character: range.start.character,
        }
      })
    }, { timeout: this.#timeout, interval: Math.round(this.#timeout / 10) })
  }

  async definition({ file, line, character }) {
    validateSchema('definition', arguments[0])
    this.#validateFile(file)

    await this.#sendRpcRequest('nvim_cmd', [{ cmd: 'edit', args: [path.join(this.#cwd, file)] }, {}])

    const luaCode = this.#renderDefinitionLua({ file, line, character })

    return retryUntil(async () => {
      const { output: resultString } = await this.#sendRpcRequest('nvim_exec2', [`lua << EOF\n${luaCode}EOF`, { output: true }])

      const responses = JSON.parse(resultString).filter(Boolean)

      const response = responses.find(({ result }) => {
        if (!result.length) {
          return false
        }
        return (
          !result[0].targetUri.endsWith(file) || result[0].targetSelectionRange.start.line != line
        )
      })
      assert(response, `Failed to get definition from lsp: ${JSON.stringify({ file, line, character })}`)

      return {
        file: './' + relative(this.#cwd, response.result[0].targetUri.replace('file://', '')),
        line: response.result[0].targetSelectionRange.start.line,
        character: response.result[0].targetSelectionRange.start.character,
      }
    }, { timeout: this.#timeout, interval: Math.round(this.#timeout / 10) })
  }

  /**
     * @param {{ changes: object[]; }} changes
     */
  async applyWorkspaceEdit(changes) {
    validateSchema('applyWorkspaceEdit', changes)

    const { output: tempBufId } = await this.#sendRpcRequest('nvim_exec2', ['lua=vim.api.nvim_create_buf(false, true)', { output: true }])

    try {
      await this.#sendRpcRequest('nvim_buf_set_lines', [Number(tempBufId), 0, -1, true, [JSON.stringify(this.#toLspChanges(changes))]])

      const luaCode = this.#renderApplyWorkspaceEditLua(Number(tempBufId))

      await this.#sendRpcRequest('nvim_exec2', [`lua << EOF\n${luaCode}EOF`, { output: true }])

    } finally {
      await this.#sendRpcRequest('nvim_buf_delete', [Number(tempBufId), { force: true }])
    }
  }

  async runTests({ fileName, testName } = {}) {
    const projectConfigPath = path.join(this.#cwd, configPath)
    const config = JSON.parse(fs.readFileSync(projectConfigPath, { encoding: 'utf-8' }))

    if (!config.testCommand) {
      throw new Error(`No test command configured. Please set the 'testCommand' property in ${projectConfigPath}`)
    }

    const testCommand = config.testCommand.split(' ')

    if (testName) {
      if (!config.nearestTestOption) {
        throw new Error(`No nearest test option configured. Please set the 'nearestTestOption' property in ${projectConfigPath}`)
      } else {
        // TODO: this is probably how AI can take over my computer. Make this safe if this project ever gets anywhere.
        testCommand.push(`${config.nearestTestOption}="${testName.replace(/"/g, '\\"')}"`)
      }
    }

    if (fileName) {
      testCommand.push(fileName)
    }

    const sh = new Shell({ cwd: this.#cwd })
    return sh(testCommand.join(' '))
  }

  #toLspChanges({ changes }) {
    const lspChanges = changes.reduce((result, change) => {
      if (change.create) {
        result.push(
          {
            kind: 'create',
            uri: `file://${path.join(this.#cwd, change.create.fileName)}`
          },
          {
            textDocument: {
              uri: `file://${path.join(this.#cwd, change.create.fileName)}`
            },
            edits: [
              {
                newText: change.create.content,
                range: {
                  start: { line: 0, character: 0 },
                  end: { line: 0, character: 0 }
                }
              }
            ]
          }
        )
      } else if (change.delete) {
        this.#validateFile(change.delete.fileName)

        result.push(
          {
            kind: 'delete',
            uri: `file://${path.join(this.#cwd, change.delete.fileName)}`
          }
        )
      } else if (change.rename) {
        this.#validateFile(change.rename.existingFileName)

        result.push(
          {
            kind: 'rename',
            oldUri: `file://${path.join(this.#cwd, change.rename.existingFileName)}`,
            newUri: `file://${path.join(this.#cwd, change.rename.newFileName)}`
          }
        )
      } else if (change.modify) {
        this.#validateFile(change.modify.fileName)

        result.push(
          {
            textDocument: {
              uri: `file://${path.join(this.#cwd, change.modify.fileName)}`
            },
            edits: [
              pick(change.modify, 'newText', 'range')
            ]
          }
        )
      } else {
        throw new Error(`Unknown change type: ${Object.keys(change)[0]}. Expected one of: create, delete, rename, modify.`)
      }
      return result
    }, [])

    return lspChanges
  }

  #renderApplyWorkspaceEditLua(temp_buffer_id) {
    return `
      local changes_json = vim.api.nvim_buf_get_lines(${temp_buffer_id}, 0, -1, false)

      vim.lsp.util.apply_workspace_edit({
        documentChanges = vim.json.decode(table.concat(changes_json, "\\n"))
      }, 'utf-8')

      vim.api.nvim_command('wall')\n`
  }

  #renderDefinitionLua({ file, line, character }) {
    return `
      local function definition()
        local params = {
          position = {
            character = ${character},
            line = ${line}
          },
          textDocument = {
            uri = "file://${path.join(this.#cwd, file)}"
          }
        }

        return vim.lsp.buf_request_sync(
          0,
          'textDocument/definition',
          params,
          2000
        )
      end

      print(vim.json.encode(definition()))\n`
  }

  #validateFile(file) {
    // file must exist and be within this.#cwd
    assert(fs.existsSync(path.join(this.#cwd, file)), `File "${file}" does not exist.`)
  }

  async #sendRpcRequest(method, args) {
    return new Promise((resolve, reject) => {
      this.#requestId += 1
      const request = [0, this.#requestId, method, args]
      log('sending %o', request)
      const msgpackData = encode(request)

      this.#nvim.stdin.write(msgpackData)
      this.#rpcJobs[this.#requestId] = { resolve, reject }

      setTimeout(() => {
        if (this.#rpcJobs[this.#requestId]) {
          delete this.#rpcJobs[this.#requestId]
          reject(new Error(`Timeout waiting for response to ${method} request`))
        }
      }, 10000)
    })
  }
}

function validateSchema(method, parameters) {
  const schema = functionSchemas.find(({ name }) => name === method).parameters
  const stopAfterFirstError = false
  const draft = '2019-09'
  const validator = new Validator(schema, draft, stopAfterFirstError)

  const result = validator.validate(parameters)

  if (!result.valid) {
    throw new Error(`Invalid parameters for ${method}: ${JSON.stringify(result.errors, null, 2)}`)
  }
}

function pick(object, ...keys) {
  return keys.reduce((result, key) => {
    result[key] = object[key]
    return result
  }, {})
}
