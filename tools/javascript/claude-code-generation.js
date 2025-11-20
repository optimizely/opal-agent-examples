/**
 * Claude Code Generation Tool
 * 
 * This Cloudflare Edge Worker provides AI-powered code generation through Claude.
 * It accepts natural language instructions and returns generated code via the Claude API.
 * 
 * Environment Variables Required:
 * - ANTHROPIC_API_KEY: Your Anthropic API key (get from https://console.anthropic.com/account/keys)
 * - WORKER_AUTH_TOKEN: A secret Bearer token to authenticate requests to this worker
 * 
 * SETUP INSTRUCTIONS:
 * 1. Visit https://console.anthropic.com/account/keys
 * 2. Sign in with your Anthropic account (create one if needed)
 * 3. Click "Create Key"
 * 4. Copy the API key
 * 5. In your Cloudflare Worker settings, add ANTHROPIC_API_KEY as an environment variable
 * 6. Paste the copied API key as the value
 * 7. Generate a secure random token (e.g., use: openssl rand -hex 32)
 * 8. Add WORKER_AUTH_TOKEN as an environment variable with your generated token
 * 9. When calling this worker, include header: Authorization: Bearer YOUR_TOKEN
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle preflight OPTIONS requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      });
    }

    // Authenticate request (except for registry endpoint which is public)
    if (path !== '/registry') {
      const authResult = authenticateRequest(request, env);
      if (!authResult.success) {
        return new Response(JSON.stringify({
          error: 'Authentication Required',
          message: authResult.message,
          details: 'Include a valid Bearer token in the Authorization header'
        }), {
          status: 401,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'WWW-Authenticate': 'Bearer realm="Claude Code Generator"'
          },
        });
      }
    }

    try {
      // Route handling
      if (path === '/registry' && request.method === 'GET') {
        return handleRegistry(corsHeaders);
      } else if (path === '/generate' && request.method === 'POST') {
        return handleCodeGeneration(request, env, corsHeaders);
      } else {
        return new Response(JSON.stringify({
          error: 'Not Found',
          message: 'Available endpoints: GET /registry, POST /generate'
        }), {
          status: 404,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
    } catch (error) {
      return new Response(JSON.stringify({
        error: 'Internal Server Error',
        message: error.message
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }
  },
};

/**
 * Authenticates requests using Bearer token
 */
function authenticateRequest(request, env) {
  // Check if WORKER_AUTH_TOKEN is configured
  if (!env.WORKER_AUTH_TOKEN) {
    return {
      success: false,
      message: 'Worker authentication is not configured. Set WORKER_AUTH_TOKEN environment variable.'
    };
  }

  // Get Authorization header
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader) {
    return {
      success: false,
      message: 'Missing Authorization header. Use format: Authorization: Bearer YOUR_TOKEN'
    };
  }

  // Validate Bearer token format
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return {
      success: false,
      message: 'Invalid Authorization header format. Use: Authorization: Bearer YOUR_TOKEN'
    };
  }

  const providedToken = parts[1];

  // Compare tokens (constant-time comparison to prevent timing attacks)
  const expectedToken = env.WORKER_AUTH_TOKEN;
  
  if (providedToken.length !== expectedToken.length) {
    return {
      success: false,
      message: 'Invalid authentication token'
    };
  }

  // Constant-time string comparison
  let mismatch = 0;
  for (let i = 0; i < providedToken.length; i++) {
    mismatch |= providedToken.charCodeAt(i) ^ expectedToken.charCodeAt(i);
  }

  if (mismatch !== 0) {
    return {
      success: false,
      message: 'Invalid authentication token'
    };
  }

  return { success: true };
}

/**
 * Registry endpoint - returns tool definitions for Opal
 */
function handleRegistry(corsHeaders) {
  const registry = {
    functions: [
      {
        name: "generate_code_from_instruction",
        description: "Generates code from natural language instructions using Claude AI. Accepts a detailed prompt describing what code to write and returns well-structured, production-ready code. Supports multiple programming languages including JavaScript (default), Python, Java, C++, and others. The tool uses Claude Haiku (fast and cost-effective) to generate code with a maximum response length of 2000 tokens. Use this when you need the AI to write code, generate boilerplate, create utility functions, or build complete applications from descriptions. The response includes the generated code, language metadata, and a brief explanation.",
        endpoint: "/generate",
        http_method: "POST",
        parameters: [
          {
            name: "instruction",
            type: "string",
            description: "The natural language instruction describing the code to generate. Be specific and detailed. Example: 'Create a function that validates email addresses and returns true if valid, false otherwise.' This is the primary input that Claude uses to understand what code to write.",
            required: true
          },
          {
            name: "language",
            type: "string",
            description: "The programming language for the generated code. Supported values: 'javascript' (default), 'python', 'java', 'cpp', 'csharp', 'go', 'rust', 'php', 'ruby', 'typescript', 'html', 'css'. If not specified, defaults to JavaScript. You can also specify format combinations like 'html-css-javascript' for multi-file generation.",
            required: false
          },
          {
            name: "include_comments",
            type: "boolean",
            description: "Whether to include inline comments explaining the code logic. Defaults to true. Set to false for minimal code output.",
            required: false
          },
          {
            name: "include_examples",
            type: "boolean",
            description: "Whether to include usage examples or test cases. Defaults to false. Set to true for more comprehensive output.",
            required: false
          }
        ],
        auth_requirements: [
          {
            provider: "OptiID",
            scope_bundle: "default",
            required: false
          }
        ]
      }
    ]
  };

  return new Response(JSON.stringify(registry, null, 2), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Code generation endpoint - sends instruction to Claude and returns generated code
 */
async function handleCodeGeneration(request, env, corsHeaders) {
  try {
    // Validate environment configuration
    if (!env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({
        error: 'Configuration Error',
        message: 'ANTHROPIC_API_KEY environment variable is not configured',
        setup_instructions: {
          step_1: 'Visit https://console.anthropic.com/account/keys',
          step_2: 'Sign in or create an Anthropic account',
          step_3: 'Click "Create Key" and copy the API key',
          step_4: 'In Cloudflare Worker settings, add ANTHROPIC_API_KEY as an environment variable',
          step_5: 'Paste the API key as the value'
        }
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({
        error: 'Invalid Request',
        message: 'Request body must be valid JSON'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    const parameters = body.parameters || {};

    // Validate required parameter
    const instruction = parameters.instruction;
    if (!instruction || instruction.trim().length === 0) {
      return new Response(JSON.stringify({
        error: 'Missing Required Parameter',
        message: 'instruction parameter is required and must not be empty',
        details: 'Provide a detailed description of the code you want generated'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    // Parse optional parameters with defaults
    const language = (parameters.language || 'javascript').toLowerCase();
    const includeComments = parameters.include_comments !== false;
    const includeExamples = parameters.include_examples === true;

    // Validate language
    const supportedLanguages = [
      'javascript', 'python', 'java', 'cpp', 'csharp', 'go', 'rust',
      'php', 'ruby', 'typescript', 'html', 'css', 'html-css-javascript'
    ];

    if (!supportedLanguages.includes(language)) {
      return new Response(JSON.stringify({
        error: 'Invalid Parameter',
        message: `Unsupported language: ${language}`,
        supported_languages: supportedLanguages
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    // Build Claude system prompt
    let systemPrompt = `You are an expert code generator. Generate clean, efficient, well-structured code that follows best practices and modern conventions for the specified language.`;

    if (includeComments) {
      systemPrompt += ` Include helpful inline comments explaining key logic and decisions.`;
    } else {
      systemPrompt += ` Do not include comments unless absolutely necessary for clarity.`;
    }

    if (includeExamples) {
      systemPrompt += ` Include practical usage examples or test cases showing how to use the generated code.`;
    }

    systemPrompt += ` Keep responses concise and focused. Maximum output length is 2000 tokens.`;

    // Build user prompt
    let userPrompt = `Generate ${language} code for the following requirement:\n\n${instruction}`;

    if (!includeComments && !includeExamples) {
      userPrompt += `\n\nProvide only the code, no explanations.`;
    }

    // Make request to Claude API
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ]
      })
    });

    // Parse Claude response
    const claudeData = await claudeResponse.json();

    // Handle API errors
    if (!claudeResponse.ok) {
      let errorMessage = 'Unknown error from Claude API';
      let errorCode = claudeData.error?.type || 'UNKNOWN_ERROR';

      if (claudeData.error?.message) {
        errorMessage = claudeData.error.message;
      }

      // Handle specific error types
      if (errorCode === 'authentication_error' || claudeData.error?.status === 401) {
        return new Response(JSON.stringify({
          error: 'Authentication Failed',
          message: 'The ANTHROPIC_API_KEY is invalid or expired',
          details: 'Verify your API key is correct and has not been revoked',
          setup_instructions: 'Visit https://console.anthropic.com/account/keys to check or regenerate your key'
        }), {
          status: 401,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        });
      }

      if (errorCode === 'rate_limit_error') {
        return new Response(JSON.stringify({
          error: 'Rate Limited',
          message: 'Too many requests to Claude API',
          details: 'Please wait a moment and try again'
        }), {
          status: 429,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        });
      }

      return new Response(JSON.stringify({
        error: 'Claude API Error',
        error_code: errorCode,
        message: errorMessage,
        request_summary: {
          language: language,
          instruction_length: instruction.length
        }
      }), {
        status: claudeResponse.status || 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    // Extract generated code from response
    if (!claudeData.content || claudeData.content.length === 0) {
      return new Response(JSON.stringify({
        error: 'Empty Response',
        message: 'Claude returned no content',
        details: 'The API request succeeded but no code was generated. Try rephrasing your instruction.'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    const generatedCode = claudeData.content[0].text;
    const tokensUsed = claudeData.usage?.output_tokens || 0;
    const inputTokens = claudeData.usage?.input_tokens || 0;

    // Build structured response
    const formattedResponse = {
      success: true,
      language: language,
      code: generatedCode,
      metadata: {
        model: 'claude-3-5-haiku-20241022',
        tokens_used: tokensUsed,
        input_tokens: inputTokens,
        include_comments: includeComments,
        include_examples: includeExamples
      },
      timestamp: new Date().toISOString(),
      instruction_summary: {
        length: instruction.length,
        first_50_chars: instruction.substring(0, 50) + (instruction.length > 50 ? '...' : '')
      }
    };

    return new Response(JSON.stringify(formattedResponse, null, 2), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });

  } catch (error) {
    console.error('Code generation error:', error);

    return new Response(JSON.stringify({
      error: 'Generation Failed',
      message: error.message,
      type: error.name,
      details: 'An unexpected error occurred during code generation'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
}
