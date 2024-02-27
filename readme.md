# coderat

Generate code changes in your local code by talking to AI (using [openai Assistant API](https://platform.openai.com/docs/assistants/overview)).

coderat exposes various LSP (language server protocol) tools to the AI. It does so via Neovim, so, at the very least, it requires an installation of Neovim with LSP configured.

## Install

[ctags](https://github.com/universal-ctags/ctags) is also required.

```sh
npm i -g coderat
```

You need `OPENAI_API_KEY` enviroment variable set. At the moment, you must have access to `gpt-4-turbo-preview` model. This is not guaranteed even for a pro users. Buy more credits (10$ will do) if that's the case.

## Usage

From a project you're working on start a new chat session with a `start` command:

```sh
coderat start $(git ls-files)
```

This creates a new chat thread, and pops open a browser window with the assistant playground. The process will keep running, listening to "tool function" calls from the assistant. If you shut it down (or it crashes), you can resume it with:

```sh
coderat resume
```

Back to the chat window. Explain what changes you want. The assistant may then use various tools, provided by coderat, to navigate your code, apply changes to your local files, and validate the results.

It's recommended to start with a clean diff, so that the changes made by AI are clearly visible.

Tools are implemented as [tool functions](https://platform.openai.com/docs/guides/function-calling). Full list of function can be found [here](./lib/functionSchemas.js).

> At the moment chat page isn't automatically updated with the results of function calls. You need to refresh it every time it calls a function.

### Running tests function

coderat needs to know how to run tests on your project. To configure this drop `.coderat.config.json` file in the project root. For example, this one is for a node project that uses mocha:

```json
{
  "testCommand": "npm run test",
  "nearestTestOption": "--fgrep"
}
```
