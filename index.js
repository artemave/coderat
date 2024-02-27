#!/usr/bin/env node

// this is a cli with two commands:
// - start
// - resume
import { program } from 'commander'
import start from './commands/start.js'
import functionsServer from './commands/functionsServer.js'

program.command('start').argument('<files...>').action(start)
program.command('resume').action(functionsServer)

await program.parseAsync()
