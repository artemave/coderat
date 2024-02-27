import OpenAI from 'openai'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { dataPath, log } from '../lib/constants.js'
import { functionSchemas } from '../lib/functionSchemas.js'
import functionsServer from './functionsServer.js'

const openai = new OpenAI();

/**
 * @param {String[]} files
 */
export default async function push(files) {
  const uploadedTagsFile = await pushTags(files)
  const uploadedReadmeFiles = await pushFiles(files.filter(file => file.toLowerCase().endsWith('.md')))

  const assistant = await ensureAssistant(process.cwd().split('/').pop())
  const threadId = await createThread({ assistant, files, uploadedFiles: [uploadedTagsFile, ...uploadedReadmeFiles]})
  openThreadInTheBrowser({ assistant, threadId })

  await functionsServer()
}

/**
 * @param {string} name
 */
async function createAssistant(name) {
  const tools = [
    { type: "code_interpreter" },
    { type: "retrieval" },
  ]
  let instructions = `You - the assistant - and I are experienced software developers working on a software project. You are helping me to implement changes across the entire codebase. Each message thread represents one change. There is a ctags tags.txt file, and markdown documentation file(s) attached to the first message in a thread. You must inspect them to understand the project.  During the chat I will be describing the changes that need to be implemented. You may ask questions or provide explanations if necessary in the message thread. Once you've understood the tags, you can optionally read individual files using function tools to further enhance your context. Use other function tools to get a better understanding of the code. Then tell me what changes you're planning to perform. Once we're agreed on them, you can go ahead and use functions to apply the changes. You can then run tests, query diagnostics, etc. to make sure your changes are correct.`

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

  const assistant = await openai.beta.assistants.create({
    instructions,
    name,
    // @ts-ignore
    tools,
    model: 'gpt-4-turbo-preview'
  });

  log('Assistant created: %O', assistant)

  return assistant
}

async function createThread({ files, uploadedFiles, assistant }) {
  const run = await openai.beta.threads.createAndRun({
    assistant_id: assistant.id,
    thread: {
      messages: [
        {
          role: 'user',
          content: 'Inspect tags.txt, readme(s), and other files from the archive if needed in order to understand the purpose and the structure of the code. Here is the file structure to get you started:\n\n```\n' + files.join('\n'),
          file_ids: uploadedFiles.map((/** @type {{ id: string; }} */ f) => f.id),
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

/**
 * @param {any[string]} files
 */
async function pushTags(files) {
  execSync(`ctags -f tags.txt ${files.join(' ')}`)

  const [file] = await pushFiles(['tags.txt'])

  if (!process.env.DEBUG) {
    fs.rmSync('./tags.txt')
  }

  return file
}

/**
 * @param {string[]} files
 */
async function pushFiles(files) {
  return Promise.all(files.map((path) => {
    const file = openai.files.create({
      file: fs.createReadStream(path),
      purpose: "assistants",
    })

    log(`Pushed file: ${path}`)

    return file
  }))
}
