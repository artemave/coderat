import fs from 'node:fs'
import { configPath, log } from './constants.js'
import OpenAI from 'openai'
import Functions from '../lib/Functions.js'

const openai = new OpenAI();

function getThreadId() {
  const config = JSON.parse(fs.readFileSync(configPath, { encoding: 'utf-8' }))
  return config.threadId
}

async function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export default async function functionsServer() {
  const functions = new Functions()
  const threadId = getThreadId()
  const thread = await openai.beta.threads.retrieve(threadId)
  log(`Serving thread: %O`, thread)

  while (true) {
    const { data: [lastRun] } = await openai.beta.threads.runs.list(threadId)

    const tool_outputs = await Promise.all((lastRun?.required_action?.submit_tool_outputs?.tool_calls || []).map(async call => {
      return {
        tool_call_id: call.id,
        output: await functions[call.function.name](JSON.parse(call.function.arguments))
      }
    }))

    if (tool_outputs.length) {
      await openai.beta.threads.runs.submitToolOutputs(threadId, lastRun.id, { tool_outputs })
    }

    await sleep(1000)
  }
}
