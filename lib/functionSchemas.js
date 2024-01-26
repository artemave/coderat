export const functionSchemas = [
  {
    name: 'definition',
    description: "Get location of a symbol definition using lsp server that runs locally on a user's machine. Arguments point at the exact location of a symbol in a file (path, line number and column) and the return value is a location of its definition in some other file.",
    parameters: {
      type: 'object',
      properties: {
        file: { type: 'string' },
        line: { type: 'number' },
        character: { type: 'number' },
      },
      required: ['file', 'line', 'character'],
    }
  },
  {
    name: 'references',
    description: "Get locations of all references to a symbol using lsp server that runs locally on a user's machine. Arguments point at the exact location of a symbol in a file (path, line number and column) and the return value is an array of locations in other files within the project workspace.",
    parameters: {
      type: 'object',
      properties: {
        file: { type: 'string' },
        line: { type: 'number' },
        character: { type: 'number' },
      },
      required: ['file', 'line', 'character'],
    }
  },
  {
    name: 'applyWorkspaceEdit',
    description: "Modify one or more files.",
    parameters: {
      type: 'object',
      properties: {
        changes: {
          type: 'array',
          description: 'A list of changes to files within the project root.',
          items: {
            type: 'object',
            properties: {
              create: {
                type: 'object',
                properties: {
                  fileName: {
                    type: 'string',
                    description: 'File path, relative to the project root.',
                    examples: ['./lib/functions.js']
                  },
                  content: { type: 'string' },
                },
                required: ['fileName', 'content'],
              },
              modify: {
                type: 'object',
                properties: {
                  fileName: {
                    type: 'string',
                    description: 'File path, relative to the project root.',
                    examples: ['./lib/functions.js']
                  },
                  range: {
                    type: 'object',
                    description: 'Text document range, that newText will replace.',
                    properties: {
                      start: {
                        type: 'object',
                        properties: {
                          line: { type: 'number' },
                          character: { type: 'number' }
                        },
                        required: ['line', 'character'],
                      },
                      end: {
                        type: 'object',
                        properties: {
                          line: { type: 'number' },
                          character: { type: 'number' }
                        },
                        required: ['line', 'character'],
                      },
                    },
                    required: ['start', 'end'],
                  },
                  newText: { type: 'string' },
                },
                required: ['fileName', 'range', 'newText'],
              },
              rename: {
                type: 'object',
                properties: {
                  existingFileName: {
                    type: 'string',
                    description: 'File path, relative to the project root.',
                    examples: ['./lib/functions.js']
                  },
                  newFileName: {
                    type: 'string',
                    description: 'File path, relative to the project root.',
                    examples: ['./lib/functions.js']
                  },
                },
                required: ['existingFileName', 'newFileName'],
              },
              delete: {
                type: 'object',
                properties: {
                  fileName: {
                    type: 'string',
                    description: 'File path, relative to the project root.',
                    examples: ['./lib/functions.js']
                  },
                },
                required: ['fileName'],
              }
            },
          },
          minItems: 1,
          uniqueItems: true,
        },
        required: ['changes'],
      }
    }
  },
  {
    name: 'runTests',
    description: 'Run all tests, or test file or a single test.',
    parameters: {
      type: 'object',
      properties: {
        fileName: {
          type: 'string',
          description: 'Test file path, relative to the project root.',
        },
        testName: { type: 'string' }
      },
      required: ['fileName']
    }
  }
];
