import fs from 'node:fs'
import { configPath, log } from '../lib/constants.js'
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
      const result = { tool_call_id: call.id }

      try {
        result.output = await functions[call.function.name](JSON.parse(call.function.arguments))
      } catch (e) {
        result.output = `Error occurred: ${e.message}`
      }

      return result
    }))

    if (tool_outputs.length) {
      await openai.beta.threads.runs.submitToolOutputs(threadId, lastRun.id, { tool_outputs })
    }

    await sleep(1000)
  }
}
