#!/usr/bin/env node

// this is a cli with two commands:
// - push
// - pull
import { program } from 'commander'
import push from './commands/push.js'
import pull from './commands/pull.js'
import functionsServer from './commands/functionsServer.js'

program.command('push').argument('<files...>').action(push)
program.command('pull').action(pull)
program.command('functions_server').action(functionsServer)

await program.parseAsync()
