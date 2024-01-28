# coderat

Generate code changes in your local code by talking to AI (using [openai Assistant API](https://platform.openai.com/docs/assistants/overview)).

## Install

```sh
npm i -g coderat
```

You need `OPENAI_API_KEY` enviroment variable set. At the moment, you must have access to `gpt-4-1106-preview` model. This is not guaranteed even for a pro users. Buy more credits (10$ will do) if that's the case.

## Usage

From a project you're working on start a new chat session with a `push` command:

```sh
coderat push $(git ls-files)
```

This will pop open a browser window with the assistant playground. Your code is in there attached.

Explain what changes you want. Once done, the assistant will generate a zip with updated files. At that point:

```sh
coderat pull
```

Resume local development (e.g. `git diff`, run tests, etc.)

> `pull` and `functions_server` (see below) operate on the chat thread, created by the last `push`.

### Arming AI with local tools

coderat can optioanally expose a range of local tools (lsp navigation, lsp diagnostics, running tests, modifying files) for assistant to make use of. This way, the AI is more informed about your code and can perform and test incremental changes. To enable this pass a `--with-functions` options to `push`:

```sh
coderat push --with-functions $(git ls-files)
```

This command starts a server and does not exit. If during chat AI decides to use local tools, the server will take care of that.
Alternatively, you can first push and the start the server:

```sh
coderat push $(git ls-files)
coderat functions_server
```

Tools are implemented as [tool functions](https://platform.openai.com/docs/guides/function-calling). Full list of function can be found [here](./lib/functionSchemas.js).

> At the moment chat page isn't automatically updated with the results of function calls. You need to refresh it every time it calls a function.

#### Running tests function

coderat needs to know how to run tests on your project. To configure this drop `.coderat.config.json` file in the project root. For example, this one is for a node project that uses mocha:

```json
{
  "testCommand": "npm run test",
  "nearestTestOption": "--fgrep"
}
```
