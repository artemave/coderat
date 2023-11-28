# coderat

Generate code changes in your local code by talking to AI (using [openai Assistant API](https://platform.openai.com/docs/assistants/overview)).

## Usage

Install:

```sh
npm i -g coderat
```

You need `OPENAI_API_KEY` enviroment variable set. At the moment, you must have access to `gpt-4-1106-preview` model. This is not guaranteed even for a pro users. Buy more credits (10$ will do) if that's the case.

Then from a project you're working on (let's assume it's a ruby project):

```sh
coderat push **/*.rb
```

This will pop open a browser window with the assistant playground. Your code is in there attached.

> Now there is a bug in the assistant UI at the moment where the page won't show you the assistant details on the left. If that's the case, you can choose it manually from the dropdown at top left of the page.

Explain what changes you want. Once done, the assistant will generate a zip with updated files. At that point:

```sh
coderat pull
```

Resume local development (e.g. `git diff`, run tests, etc.)
