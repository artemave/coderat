import AdmZip from 'adm-zip'
import OpenAI from 'openai'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { configPath, log } from './constants.js'
import { temporaryFile } from 'tempy'
import { dirname } from 'node:path'

const openai = new OpenAI();

/**
 * @param {String[]} files
 */
export default async function push(files) {
  const uploadedFile = await pushArchive(files)
  const assistant = await ensureAssistant(process.cwd().split('/').pop())
  const thread = await createThread(uploadedFile)
  openThreadInTheBrowser({ assistant, thread })
}

/**
 * @param {String[]} files
 * @param {string} [zipPath]
 */
function createZip(files, zipPath) {
  const zip = new AdmZip()
  files.forEach(file => zip.addLocalFile(file, dirname(file)))
  zip.writeZip(zipPath)
}

/**
 * @param {string} name
 */
async function createAssistant(name) {
  const assistant = await openai.beta.assistants.create({
    instructions: `You - the assistant - and I are working on a software project. The entire source code of the said project is attached in a zip file. I will be describing you a change that needs implementing and you will generate me a zip files with all changed files. You only need to include changed files, but the file structure and names must remain the same. You may ask questions or provide explanations if necessary in the message thread. But the end result must always be a zip with updated files.`,
    name,
    tools: [
      { type: "code_interpreter" },
      {
        type: 'function',
        function: {
          name: 'definition',
          description: "Get location of a symbol definition using lsp server that runs locally on a user's machine. Arguments point at the exact location of a symbol in a file (path, line number and column) and the return value is a location of its definition in some other file.",
          parameters: {
            type: 'object',
            properties: {
              file: { type: 'string' },
              line: { type: 'number' },
              character: { type: 'number' },
            },
            required: ['file', 'line', 'character'],
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'references',
          description: "Get locations of all references to a symbol using lsp server that runs locally on a user's machine. Arguments point at the exact location of a symbol in a file (path, line number and column) and the return value is an array of locations in other files within the project workspace.",
          parameters: {
            type: 'object',
            properties: {
              file: { type: 'string' },
              line: { type: 'number' },
              character: { type: 'number' },
            },
            required: ['file', 'line', 'character'],
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'applyWorkspaceEdit',
          description: "Modify one or more files.",
          parameters: {
            type: 'array',
            name: 'changes',
            item_type: {
              properties: {
                create: {
                  type: 'object',
                  properties: {
                    fileName: { type: 'string' },
                    content: { type: 'string' },
                  },
                  required: ['fileName', 'content'],
                },
                modify: {
                  type: 'object',
                  properties: {
                    fileName: { type: 'string' },
                    range: {
                      type: 'object',
                      properties: {
                        start: {
                          type: 'object',
                          properties: {
                            line: { type: 'number' },
                            character: { type: 'number' }
                          },
                          required: ['line', 'character'],
                        },
                        end: {
                          type: 'object',
                          properties: {
                            line: { type: 'number' },
                            character: { type: 'number' }
                          },
                          required: ['line', 'character'],
                        },
                        newText: { type: 'string' },
                      },
                      required: ['start', 'end', 'newText'],
                    },
                  },
                  required: ['fileName', 'range'],
                },
                rename: {
                  type: 'object',
                  properties: {
                    existingFileName: { type: 'string' },
                    newFileName: { type: 'string' },
                  },
                  required: ['existingFileName', 'newFileName'],
                },
                delete: {
                  type: 'object',
                  properties: {
                    fileName: { type: 'string' },
                  },
                  required: ['fileName'],
                }
              },
            },
            required: ['changes'],
          }
        }
      }
    ],
    model: "gpt-4-1106-preview"
  });

  log('Assistant created: %O', assistant)

  return assistant
}

/**
 * @param {String[]} files
 */
async function pushArchive(files) {
  const zipPath = temporaryFile({name: 'coderat.zip'})
  createZip(files, zipPath)

  const file = await openai.files.create({
    file: fs.createReadStream(zipPath),
    purpose: "assistants",
  });

  log(`Zip created: %O`, zipPath)

  if (!process.env.DEBUG) {
    fs.rmSync(zipPath)
  }

  return file
}

/**
 * @param {OpenAI.Files.FileObject} uploadedFile
 */
async function createThread(uploadedFile) {
  const thread = await openai.beta.threads.create({
    messages: [
      {
        role: 'user',
        content: 'here is a zip with the source code',
        file_ids: [ uploadedFile.id ],
      }
    ]
  });
  fs.writeFileSync(configPath, JSON.stringify({ threadId: thread.id }))

  log(`Thread created: %O`, thread)

  return thread
}

function openThreadInTheBrowser({ assistant, thread }) {
  const osSpecifiOpenCmd = process.platform === 'darwin' ? 'open' : 'xdg-open'

  execSync(
    `${osSpecifiOpenCmd} 'https://platform.openai.com/playground?assistant=${assistant.id}&thread=${thread.id}'`
  );
}

/**
 * @param {string} name
 */
async function ensureAssistant(name) {
  return openai.beta.assistants.list().then(({ data }) => {
    const assistant = data.find(assistant => assistant.name === name)
    if (assistant) {
      log(`Using existing assistant: %O`, assistant)
      return assistant
    } else {
      return createAssistant(name)
    }
  })
}
