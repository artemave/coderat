import { relative } from 'node:path'
import { encode, decode } from 'msgpack-lite'
import { log } from '../commands/constants.js'
import { spawn } from 'node:child_process'
import assert from 'node:assert'
import path from 'node:path'

export async function retryUntil(fn, { timeout = 5000, interval = 300 } = {}) {
  try {
    return await fn()
  } catch (e) {
    if (e.name === 'AssertionError') {
      if (timeout <= 0) {
        console.error('timeout')
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
  #nvim

  constructor(cwd = process.cwd()) {
    this.#cwd = cwd

    this.#nvim = spawn(
      'nvim',
      ['--headless', '--embed'],
      { cwd: process.cwd() }
    )
    this.#nvim.stdout.setEncoding('binary')
  }

  dispose() {
    this.#nvim.kill('SIGTERM')
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
    })
  }

  async definition({ file, line, character }) {
    await this.#sendRpcRequest('nvim_cmd', [{ cmd: 'edit', args: [path.join(this.#cwd, file)] }, {}])

    const luaCode = this.#renderDefinitionLua({ file, line, character })

    return retryUntil(async () => {
      const { output: resultString } = await this.#sendRpcRequest('nvim_exec2', [`lua << EOF\n${luaCode}EOF`, { output: true }])

      const responses = JSON.parse(resultString).filter(Boolean)

      const response = responses.find(({ result }) => {
        return (
          !result[0].targetUri.endsWith(file) || result[0].originSelectionRange.start.line != line
        )
      })
      assert(response, `Failed to get definition from lsp: ${JSON.stringify({ file, line, character })}`)

      return {
        file: './' + relative(this.#cwd, response.result[0].targetUri.replace('file://', '')),
        line: response.result[0].targetSelectionRange.start.line,
        character: response.result[0].targetSelectionRange.start.character,
      }
    })
  }

  async applyWorkspaceEdit(changes) {
    const luaCode = this.#renderApplyWorkspaceEditLua(this.#toLspChanges(changes))

    await this.#sendRpcRequest('nvim_exec2', [`lua << EOF\n${luaCode}EOF`, { output: true }])
  }

  #toLspChanges(changes) {
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
        result.push(
          {
            kind: 'delete',
            uri: `file://${path.join(this.#cwd, change.delete.fileName)}`
          }
        )
      } else if (change.rename) {
        result.push(
          {
            kind: 'rename',
            oldUri: `file://${path.join(this.#cwd, change.rename.existingFileName)}`,
            newUri: `file://${path.join(this.#cwd, change.rename.newFileName)}`
          }
        )
      } else if (change.modify) {
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

  #renderApplyWorkspaceEditLua(changes) {
    return `
      local function applyWorkspaceEdit()
        local params = {
          documentChanges = vim.json.decode('${JSON.stringify(changes).replace(/'/g, "\\'")}')
        }
        vim.lsp.util.apply_workspace_edit(params, 'utf-8')
      end

      applyWorkspaceEdit()
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

  async #sendRpcRequest(method, args) {
    this.#requestId += 1
    const request = [0, this.#requestId, method, args]
    log('sending %o', request)
    const msgpackData = encode(request)
    this.#nvim.stdin.write(msgpackData)

    return new Promise((resolve, reject) => {
      this.#nvim.stdout.once('data', (data) => {
        const [_, responseId, error, result] = decode(Buffer.from(data, 'binary'))
        log('received: %o', { responseId, error, result })
        if (responseId !== this.#requestId) {
          reject(new Error(`Mismatched response id (got ${responseId}, expected ${this.#requestId})`))
        } else if (error) {
          reject(new Error(error))
        } else {
          resolve(result)
        }
      })
    })
  }
}

function pick(object, ...keys) {
  return keys.reduce((result, key) => {
    result[key] = object[key]
    return result
  }, {})
}

