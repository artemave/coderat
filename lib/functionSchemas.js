export const functionSchemas = [
  {
    name: 'definition',
    description: "Retrieves the location of the definition of a symbol used within the source code. The parameters point a valid location of a symbol in a file (path, line number and character). The return value is an object indicating the location of the symbol definition, consisting of the file path, line number, and character offset within that file. If nothing is found an error is returned, suggesting that the provided arguments were wrong. It is essential that the location accurately identifies a genuine symbol usage in the source file to ensure successful execution.",
    parameters: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'File path, relative to the project root (case sensitive).',
          examples: ['./lib/functions.js']
        },
        line: { type: 'number' },
        character: { type: 'number' },
      },
      required: ['file', 'line', 'character'],
    }
  },
  {
    name: 'references',
    description: "Retrieves locations of all references to a symbol used within the source code. The parameters point a valid location of a symbol in a file (path, line number and character). The return value is an array of object locations within workspace. If no references are found, an error is returned. Which means either there genuinely are no references, or that the parameters were wrong.",
    parameters: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'File path, relative to the project root (case sensitive).',
          examples: ['./lib/functions.js']
        },
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
          description: 'A list of changes to files within the project root (case sensitive).',
          items: {
            type: 'object',
            properties: {
              create: {
                type: 'object',
                properties: {
                  fileName: {
                    type: 'string',
                    description: 'File path, relative to the project root (case sensitive).',
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
                    description: 'File path, relative to the project root (case sensitive).',
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
                    description: 'File path, relative to the project root (case sensitive).',
                    examples: ['./lib/functions.js']
                  },
                  newFileName: {
                    type: 'string',
                    description: 'File path, relative to the project root (case sensitive).',
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
                    description: 'File path, relative to the project root (case sensitive).',
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
      },
      required: ['changes'],
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
          description: 'Test file path, relative to the project root (case sensitive).',
        },
        testName: { type: 'string' }
      },
      required: ['fileName']
    }
  },
  {
    name: 'readFile',
    description: 'Read file content.',
    parameters: {
      type: 'object',
      properties: {
        fileName: {
          type: 'string',
          description: 'File path, relative to the project root (case sensitive).',
          examples: ['./lib/functions.js']
        }
      },
      required: ['fileName']
    }
  }
];
