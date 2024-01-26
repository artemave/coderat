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

> Now there is a bug in the assistant UI at the moment where the page won't show you the assistant details on the left. If that's the case, you can choose it manually from the dropdown at top left of the page.

Explain what changes you want. Once done, the assistant will generate a zip with updated files. At that point:

```sh
coderat pull
```

Resume local development (e.g. `git diff`, run tests, etc.)

### Arming AI with local tools

coderat can optioanally expose a range of local tools (lsp navigation, lsp diagnostics, running tests, modifying files) for assistant to make use of. This way, the AI is more informed about your code and can perform and test incremental changes. To enable this pass a `--with-functions` options to `push`:

```sh
coderat push --with-functions $(git ls-files)
```

This command starts a server and does not exit. If during chat AI decides to use local tools, the server will take care of that.
