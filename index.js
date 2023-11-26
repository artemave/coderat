#!/usr/bin/env node

// this is a cli with two commands:
// - push
// - pull
import { program } from 'commander'
import push from './commands/push.js'
import pull from './commands/pull.js'

program.command('push').argument('<files...>').action(push)
program.command('pull').action(pull)

await program.parseAsync()
