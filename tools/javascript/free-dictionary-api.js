/**
 * Dictionary API Integration Tool
 * 
 * This Cloudflare Edge Worker provides comprehensive dictionary functionality
 * using the Free Dictionary API (dictionaryapi.dev).
 * 
 * Features:
 * - Word definitions with multiple meanings
 * - Phonetic pronunciations (text and audio)
 * - Part of speech identification
 * - Synonyms and antonyms
 * - Usage examples
 * - Etymology information
 * 
 * No environment variables required - this is a free, public API.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle preflight OPTIONS requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      });
    }

    try {
      // Route handling
      if (path === '/registry' && request.method === 'GET') {
        return handleRegistry(corsHeaders);
      } else if (path === '/define' && request.method === 'POST') {
        return handleDefinition(request, corsHeaders);
      } else if (path === '/synonyms' && request.method === 'POST') {
        return handleSynonyms(request, corsHeaders);
      } else if (path === '/pronunciation' && request.method === 'POST') {
        return handlePronunciation(request, corsHeaders);
      } else {
        return new Response(JSON.stringify({ 
          error: 'Not Found',
          message: 'Available endpoints: GET /registry, POST /define, POST /synonyms, POST /pronunciation'
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
        message: error.message,
        stack: error.stack
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
 * Registry endpoint - returns the tool definitions for Opal
 */
function handleRegistry(corsHeaders) {
  const registry = {
    functions: [
      {
        name: "get_word_definition",
        description: "Retrieves comprehensive dictionary information for a specific English word including all definitions across different parts of speech (noun, verb, adjective, etc.), usage examples, and etymology. This tool returns detailed linguistic information organized by part of speech, with each meaning including its definition and example sentences showing the word used in context. Use this when a user asks for the meaning of a word, wants to understand how a word is used, needs multiple definitions of a word, or requests the origin/history of a word. The tool handles common words, technical terms, slang, and archaic words. If the word has multiple meanings or can function as different parts of speech, all variations are returned.",
        endpoint: "/define",
        http_method: "POST",
        parameters: [
          {
            name: "word",
            type: "string",
            description: "The English word to look up in the dictionary. Must be a single word without spaces. Case-insensitive. Examples: 'eloquent', 'serendipity', 'run', 'happy'. For compound words, use the hyphenated form if applicable (e.g., 'well-being'). The API supports American and British English spellings.",
            required: true
          }
        ],
        auth_requirements: []
      },
      {
        name: "find_synonyms_antonyms",
        description: "Retrieves synonyms (words with similar meanings) and antonyms (words with opposite meanings) for a specified English word. Returns results organized by part of speech and by specific meaning, since a word can have different synonyms depending on its usage context. For example, 'light' as a noun (illumination) has different synonyms than 'light' as an adjective (not heavy). Use this when a user asks for alternative words, similar words, opposite words, or wants to avoid repetition in writing. This is particularly useful for content creation, vocabulary building, and understanding word relationships. If a word has no synonyms or antonyms listed in the dictionary, the tool will indicate this.",
        endpoint: "/synonyms",
        http_method: "POST",
        parameters: [
          {
            name: "word",
            type: "string",
            description: "The English word for which to find synonyms and antonyms. Must be a single word without spaces. Case-insensitive. Examples: 'happy', 'fast', 'difficult', 'create'.",
            required: true
          }
        ],
        auth_requirements: []
      },
      {
        name: "get_pronunciation",
        description: "Retrieves pronunciation information for an English word including phonetic spelling in International Phonetic Alphabet (IPA) format and, when available, links to audio files demonstrating correct pronunciation. Returns both text-based phonetic representations (which show how to pronounce the word using standardized symbols) and audio URLs (which provide actual recordings of the word being spoken). Use this when a user asks how to pronounce a word, wants to hear a word spoken aloud, needs the phonetic spelling, or is learning English pronunciation. The tool provides multiple pronunciation variants when a word has different accepted pronunciations (e.g., regional differences between American and British English).",
        endpoint: "/pronunciation",
        http_method: "POST",
        parameters: [
          {
            name: "word",
            type: "string", 
            description: "The English word for which to retrieve pronunciation information. Must be a single word without spaces. Case-insensitive. Examples: 'schedule', 'aluminium', 'extraordinary', 'nuclear'.",
            required: true
          }
        ],
        auth_requirements: []
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
 * Custom error class for API errors
 */
class DictionaryError extends Error {
  constructor(message, statusCode, data = null) {
    super(message);
    this.name = 'DictionaryError';
    this.statusCode = statusCode;
    this.data = data;
  }
}

/**
 * Shared function to fetch word data from dictionary API
 */
async function fetchWordData(word) {
  const apiUrl = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
  
  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  });

  const responseText = await response.text();
  let data;
  
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    throw new DictionaryError(`Invalid JSON response from Dictionary API: ${responseText}`, 500);
  }

  if (!response.ok) {
    throw new DictionaryError(
      data.message || `Word "${word}" not found`,
      response.status,
      data
    );
  }

  return Array.isArray(data) ? data : [data];
}

/**
 * Validates and extracts word parameter from request
 */
async function extractWordParameter(request) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    throw new DictionaryError('Request body must be valid JSON', 400);
  }

  const parameters = body.parameters || {};
  const word = parameters.word?.trim().toLowerCase();
  
  if (!word) {
    throw new DictionaryError('word parameter is required', 400);
  }

  if (word.includes(' ') && !word.includes('-')) {
    throw new DictionaryError('word must be a single word (no spaces). Use hyphens for compound words.', 400);
  }

  return word;
}

/**
 * Definition endpoint - retrieves complete word information
 */
async function handleDefinition(request, corsHeaders) {
  try {
    const word = await extractWordParameter(request);
    const entries = await fetchWordData(word);

    // Format response with all dictionary data
    const formattedEntries = [];

    for (const entry of entries) {
      const formattedEntry = {
        word: entry.word,
        phonetics: entry.phonetics?.map(p => ({
          text: p.text,
          audio_url: p.audio || null,
          source_url: p.sourceUrl || null,
          license: p.license ? {
            name: p.license.name,
            url: p.license.url
          } : null
        })).filter(p => p.text || p.audio_url) || [],
        origin: entry.origin || null,
        meanings: []
      };

      // Process meanings by part of speech
      if (entry.meanings && Array.isArray(entry.meanings)) {
        for (const meaning of entry.meanings) {
          const formattedMeaning = {
            part_of_speech: meaning.partOfSpeech,
            definitions: [],
            synonyms: meaning.synonyms || [],
            antonyms: meaning.antonyms || []
          };

          if (meaning.definitions && Array.isArray(meaning.definitions)) {
            for (const def of meaning.definitions) {
              formattedMeaning.definitions.push({
                definition: def.definition,
                example: def.example || null,
                synonyms: def.synonyms || [],
                antonyms: def.antonyms || []
              });
            }
          }

          formattedEntry.meanings.push(formattedMeaning);
        }
      }

      formattedEntries.push(formattedEntry);
    }

    // Create summary for better UX
    const totalDefinitions = formattedEntries.reduce((sum, entry) => 
      sum + entry.meanings.reduce((mSum, m) => mSum + m.definitions.length, 0), 0
    );

    const partsOfSpeech = [...new Set(
      formattedEntries.flatMap(e => e.meanings.map(m => m.part_of_speech))
    )];

    const response = {
      word: word,
      found: true,
      summary: {
        total_definitions: totalDefinitions,
        parts_of_speech: partsOfSpeech,
        has_audio: formattedEntries.some(e => e.phonetics.some(p => p.audio_url)),
        has_origin: formattedEntries.some(e => e.origin)
      },
      entries: formattedEntries
    };

    return new Response(JSON.stringify(response, null, 2), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });

  } catch (error) {
    console.error('Dictionary lookup error:', error);
    
    const statusCode = error.statusCode || 500;
    const errorResponse = {
      error: statusCode === 404 ? 'Word Not Found' : 
             statusCode === 400 ? 'Invalid Parameter' : 'Lookup Failed',
      message: error.message,
      word: error.word
    };

    if (error.data?.suggestion) {
      errorResponse.suggestion = error.data.suggestion;
    }

    return new Response(JSON.stringify(errorResponse), {
      status: statusCode,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
}

/**
 * Synonyms endpoint - extracts and organizes synonyms/antonyms
 */
async function handleSynonyms(request, corsHeaders) {
  try {
    const word = await extractWordParameter(request);
    const entries = await fetchWordData(word);

    // Collect all synonyms and antonyms organized by part of speech
    const synonymsByPos = {};
    const antonymsByPos = {};

    for (const entry of entries) {
      if (entry.meanings) {
        for (const meaning of entry.meanings) {
          const pos = meaning.partOfSpeech;
          
          if (!synonymsByPos[pos]) {
            synonymsByPos[pos] = new Set();
            antonymsByPos[pos] = new Set();
          }

          // Add meaning-level synonyms/antonyms
          if (meaning.synonyms) {
            meaning.synonyms.forEach(s => synonymsByPos[pos].add(s));
          }
          if (meaning.antonyms) {
            meaning.antonyms.forEach(a => antonymsByPos[pos].add(a));
          }

          // Add definition-level synonyms/antonyms
          if (meaning.definitions) {
            for (const def of meaning.definitions) {
              if (def.synonyms) {
                def.synonyms.forEach(s => synonymsByPos[pos].add(s));
              }
              if (def.antonyms) {
                def.antonyms.forEach(a => antonymsByPos[pos].add(a));
              }
            }
          }
        }
      }
    }

    // Convert sets to arrays and format
    const formattedResults = [];
    for (const pos of Object.keys(synonymsByPos)) {
      formattedResults.push({
        part_of_speech: pos,
        synonyms: Array.from(synonymsByPos[pos]),
        antonyms: Array.from(antonymsByPos[pos])
      });
    }

    // Calculate totals
    const totalSynonyms = formattedResults.reduce((sum, r) => sum + r.synonyms.length, 0);
    const totalAntonyms = formattedResults.reduce((sum, r) => sum + r.antonyms.length, 0);

    const response = {
      word: word,
      found: true,
      summary: {
        total_synonyms: totalSynonyms,
        total_antonyms: totalAntonyms,
        has_synonyms: totalSynonyms > 0,
        has_antonyms: totalAntonyms > 0
      },
      results: formattedResults
    };

    return new Response(JSON.stringify(response, null, 2), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });

  } catch (error) {
    console.error('Synonyms lookup error:', error);
    
    const statusCode = error.statusCode || 500;
    return new Response(JSON.stringify({
      error: statusCode === 404 ? 'Word Not Found' : 
             statusCode === 400 ? 'Invalid Parameter' : 'Lookup Failed',
      message: error.message
    }), {
      status: statusCode,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
}

/**
 * Pronunciation endpoint - extracts phonetics and audio
 */
async function handlePronunciation(request, corsHeaders) {
  try {
    const word = await extractWordParameter(request);
    const entries = await fetchWordData(word);

    // Collect all phonetic information
    const pronunciations = [];
    const audioUrls = [];

    for (const entry of entries) {
      if (entry.phonetics) {
        for (const phonetic of entry.phonetics) {
          if (phonetic.text) {
            pronunciations.push({
              phonetic_spelling: phonetic.text,
              audio_url: phonetic.audio || null,
              source_url: phonetic.sourceUrl || null,
              license: phonetic.license ? {
                name: phonetic.license.name,
                url: phonetic.license.url
              } : null
            });
          }
          
          if (phonetic.audio && !audioUrls.includes(phonetic.audio)) {
            audioUrls.push(phonetic.audio);
          }
        }
      }
    }

    // Deduplicate pronunciations by phonetic spelling
    const uniquePronunciations = pronunciations.reduce((acc, curr) => {
      const exists = acc.find(p => p.phonetic_spelling === curr.phonetic_spelling);
      if (!exists) {
        acc.push(curr);
      } else if (curr.audio_url && !exists.audio_url) {
        exists.audio_url = curr.audio_url;
        exists.source_url = curr.source_url;
        exists.license = curr.license;
      }
      return acc;
    }, []);

    const response = {
      word: word,
      found: true,
      summary: {
        pronunciation_variants: uniquePronunciations.length,
        has_audio: audioUrls.length > 0,
        audio_files_available: audioUrls.length
      },
      pronunciations: uniquePronunciations,
      all_audio_urls: audioUrls
    };

    return new Response(JSON.stringify(response, null, 2), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });

  } catch (error) {
    console.error('Pronunciation lookup error:', error);
    
    const statusCode = error.statusCode || 500;
    return new Response(JSON.stringify({
      error: statusCode === 404 ? 'Word Not Found' : 
             statusCode === 400 ? 'Invalid Parameter' : 'Lookup Failed',
      message: error.message
    }), {
      status: statusCode,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
}
