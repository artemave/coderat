import AdmZip from 'adm-zip'
import OpenAI from 'openai'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { dataPath, log } from '../lib/constants.js'
import { temporaryFile } from 'tempy'
import { dirname } from 'node:path'
import { functionSchemas } from '../lib/functionSchemas.js'
import functionsServer from './functionsServer.js'

const openai = new OpenAI();

/**
 * @param {String[]} files
 * @param {{ withFunctions: boolean; }} options
 */
export default async function push(files, options) {
  const uploadedArchiveFile = await pushArchive(files)
  const assistant = await ensureAssistant(process.cwd().split('/').pop(), options)
  const threadId = await createThread({ assistant, uploadedFiles: [uploadedArchiveFile]})
  openThreadInTheBrowser({ assistant, threadId })

  if (options.withFunctions) {
    await functionsServer()
  }
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
 * @param {{ withFunctions: boolean; }} options
 */
async function createAssistant(name, options) {
  const tools = [
    { type: "code_interpreter" },
  ]
  let instructions = `You - the assistant - and I are experienced software developers working on a software project. You are helping me to implement changes across the entire codebase. Each message thread represents one change. There is a zip file with source code attached to the first message in a thread. It also contains a ctags tags file that you must inspect to understand the project structure. You must also read and understand the project readme to get an idea of what the project is about. It's important that you read and understand readme and tags before anything else. Once you've understood the tags, you can optionally read individual files to further enhance your context. During the chat I will be describing the changes that need to be implemented. You may ask questions or provide explanations if necessary in the message thread.`

  if (options.withFunctions) {
    instructions = `${instructions} Use 'functions' tools to get a better understanding of the code. Then tell me what changes you're planning to perform. Once we're agreed on them, you can go ahead and use functions to apply the changes. You can then run tests, query diagnostics, etc. to make sure your changes are correct.`

    tools.push(
      ...functionSchemas.map(
        schema => {
          return {
            type: 'function',
            function: schema
          }
        }
      )
    )
  } else {
    instructions = `${instructions} The end result must always be a zip with updated files. You only need to include changed files, but the file structure and names must remain the same (unless you add new files/directories).`
  }

  const assistant = await openai.beta.assistants.create({
    instructions,
    name,
    tools,
    model: 'gpt-4-turbo-preview'
  });

  log('Assistant created: %O', assistant)

  return assistant
}

/**
 * @param {String[]} files
 */
async function pushArchive(files) {
  const tagsFileExists = fs.existsSync('tags')
  const zipPath = temporaryFile({name: 'coderat.zip'})

  execSync(`ctags ${files.join(' ')}`)

  createZip(files.concat('./tags'), zipPath)

  const file = await openai.files.create({
    file: fs.createReadStream(zipPath),
    purpose: "assistants",
  });

  log(`Zip created: %O`, zipPath)

  if (!process.env.DEBUG) {
    fs.rmSync(zipPath)

    if (!tagsFileExists) {
      fs.rmSync('./tags')
    }
  }

  return file
}

/**
 * @param {{ uploadedFiles: { id: string; }[]; assistant: { id: string; }; }} param0
 */
async function createThread({ uploadedFiles, assistant }) {
  const run = await openai.beta.threads.createAndRun({
    assistant_id: assistant.id,
    thread: {
      messages: [
        {
          role: 'user',
          content: 'Inspect tags.txt file, readme and other files if needed in order to understand the purpose and the structure of the code.',
          file_ids: uploadedFiles.map(f => f.id),
        }
      ]
    }
  });
  fs.writeFileSync(dataPath, JSON.stringify({ threadId: run.thread_id }))

  log(`Created thread and run: %O`, run)

  return run.thread_id
}

function openThreadInTheBrowser({ assistant, threadId }) {
  const osSpecifiOpenCmd = process.platform === 'darwin' ? 'open' : 'xdg-open'

  execSync(
    `${osSpecifiOpenCmd} 'https://platform.openai.com/playground?assistant=${assistant.id}&thread=${threadId}'`
  );
}

/**
 * @param {string} name
 * @param {{ withFunctions: boolean; }} options
 */
async function ensureAssistant(name, options) {
  return openai.beta.assistants.list().then(({ data }) => {
    const assistant = data.find(assistant => assistant.name === name)
    if (assistant) {
      log(`Using existing assistant: %O`, assistant)
      return assistant
    } else {
      return createAssistant(name, options)
    }
  })
}
