import AdmZip from 'adm-zip'
import OpenAI from 'openai'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { configPath, log } from '../lib/constants.js'
import { temporaryFile } from 'tempy'
import { dirname } from 'node:path'
import { functionSchemas } from '../lib/functionSchemas.js'

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
      ...functionSchemas.map(
        schema => {
          return {
            type: 'function',
            function: schema
          }
        }
      )
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
