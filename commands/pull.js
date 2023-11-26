import AdmZip from 'adm-zip'
import fs from 'node:fs'
import { configPath, log } from './constants.js'
import OpenAI from 'openai'

const openai = new OpenAI();

export default async function pull() {
  const threadId = getThreadId()
  const thread = await openai.beta.threads.retrieve(threadId)
  log(`Using thread: %O`, thread)

  const archiveArrayBuffer = await downloadUpdatedZip(thread)
  await extractArchive(archiveArrayBuffer)
}

function getThreadId() {
  const config = JSON.parse(fs.readFileSync(configPath, { encoding: 'utf-8' }))
  return config.threadId
}

/**
 * @param {OpenAI.Beta.Threads.Thread} thread
 */
async function downloadUpdatedZip(thread) {
  const messages = await openai.beta.threads.messages.list(thread.id)
  const lastMessageWithFile = messages.data.find(message => message.file_ids.length)
  log(`Assuming the zip in this message: %O`, lastMessageWithFile)

  const resultZipFileId = lastMessageWithFile.file_ids[0]

  const zipContentResponse = await openai.files.content(resultZipFileId)
  const zipContentData = await zipContentResponse.arrayBuffer()

  return zipContentData
}

/**
 * @param {WithImplicitCoercion<ArrayBuffer | SharedArrayBuffer>} archiveArrayBuffer
 */
async function extractArchive(archiveArrayBuffer) {
  const zip = new AdmZip(Buffer.from(archiveArrayBuffer))
  zip.extractAllTo(process.cwd(), true)
}
