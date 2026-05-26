import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { ActionRegistry } from '../content/actions';
import type { PromptPayload } from '../content/actions';

interface HistoryItem {
  id: string;
  timestamp: number;
  url: string;
  action: string;
  originalText: string;
  rewrittenText: string;
  provider: string;
  model: string;
}

async function saveToHistory(item: Omit<HistoryItem, 'id' | 'timestamp'>) {
  try {
    const data = await chrome.storage.local.get('history') as any;
    const history = data.history || [];
    const newItem: HistoryItem = {
      ...item,
      id: crypto.randomUUID(),
      timestamp: Date.now()
    };
    const updatedHistory = [newItem, ...history].slice(0, 100);
    await chrome.storage.local.set({ history: updatedHistory });
  } catch (err) {
    console.error('Failed to save history:', err);
  }
}

// Prompt building via ActionRegistry
let _registry: ActionRegistry | null = null;

async function getRegistry(): Promise<ActionRegistry> {
  if (!_registry) {
    _registry = new ActionRegistry();
    await _registry.loadCustoms();
  }
  return _registry;
}

function buildSystemPrompt(payload: PromptPayload): { system?: string; user: string } {
  if (payload.system) {
    return {
      system: payload.system,
      user: payload.user,
    };
  }
  return { user: payload.user };
}

function chatMessages(system?: string, prompt?: string) {
  const msgs: { role: string; content: string }[] = [];
  if (system) msgs.push({ role: 'system', content: system });
  if (prompt) msgs.push({ role: 'user', content: prompt });
  return msgs;
}

async function fetchOpenRouter(apiKey: string, model: string, prompt: string, system?: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey || ''}`,
      'HTTP-Referer': 'https://github.com/hone-extension',
      'X-Title': 'Hone'
    },
    body: JSON.stringify({
      model,
      messages: chatMessages(system, prompt),
      temperature: 0.7
    })
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson?.error?.message || `OpenRouter request failed: ${res.statusText}`);
  }

  const data = await res.json();
  const resultText = data.choices?.[0]?.message?.content?.trim();
  if (!resultText) throw new Error('Empty response received from OpenRouter.');
  return resultText;
}

// Helper to make API calls
async function callAIProvider(actionId: string, text: string, url: string): Promise<string> {
  const [settings, registry] = await Promise.all([
    chrome.storage.local.get([
      'activeProvider',
      'openaiKey',
      'openaiModel',
      'openaiEndpoint',
      'anthropicKey',
      'anthropicModel',
      'geminiKey',
      'geminiModel',
      'openrouterKey',
      'openrouterModel',
      'openrouterPaidKey',
      'openrouterPaidModel',
      'googleAiStudioKey',
      'googleAiStudioModel'
    ]) as any,
    getRegistry()
  ]);

  const provider = settings.activeProvider || 'openrouter';
  const { system, user: prompt } = buildSystemPrompt(registry.buildPrompt(actionId, text));

  if (provider === 'openai') {
    const apiKey = settings.openaiKey;
    const model = settings.openaiModel || 'gpt-4o-mini';
    const endpoint = settings.openaiEndpoint || 'https://api.openai.com/v1/chat/completions';

    if (!apiKey) throw new Error('OpenAI API Key is missing. Please add it in the extension options.');

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: chatMessages(system, prompt),
        temperature: 0.7
      })
    });

    if (!res.ok) {
      const errorJson = await res.json().catch(() => ({}));
      throw new Error(errorJson?.error?.message || `OpenAI request failed: ${res.statusText}`);
    }

    const data = await res.json();
    const resultText = data.choices?.[0]?.message?.content?.trim();
    if (!resultText) throw new Error('Empty response received from OpenAI.');

    await saveToHistory({ originalText: text, rewrittenText: resultText, action: actionId, url, provider, model });
    return resultText;

  } else if (provider === 'anthropic') {
    const apiKey = settings.anthropicKey;
    const model = settings.anthropicModel || 'claude-3-5-sonnet-20241022';

    if (!apiKey) throw new Error('Anthropic API Key is missing. Please add it in the extension options.');

    const body: any = {
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    };
    if (system) {
      body.system = [{ text: system }];
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'dangerously-allow-browser': 'true'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errorJson = await res.json().catch(() => ({}));
      throw new Error(errorJson?.error?.message || `Anthropic request failed: ${res.statusText}`);
    }

    const data = await res.json();
    const resultText = data.content?.[0]?.text?.trim();
    if (!resultText) throw new Error('Empty response received from Anthropic.');

    await saveToHistory({ originalText: text, rewrittenText: resultText, action: actionId, url, provider, model });
    return resultText;

  } else if (provider === 'gemini') {
    const apiKey = settings.geminiKey;
    const model = settings.geminiModel || 'gemini-1.5-flash';

    if (!apiKey) throw new Error('Gemini API Key is missing. Please add it in the extension options.');

    const body: any = {
      contents: [{
        parts: [{ text: prompt }]
      }]
    };
    if (system) {
      body.systemInstruction = { parts: [{ text: system }] };
    }

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errorJson = await res.json().catch(() => ({}));
      throw new Error(errorJson?.error?.message || `Gemini request failed: ${res.statusText}`);
    }

    const data = await res.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!resultText) throw new Error('Empty response received from Gemini.');

    await saveToHistory({ originalText: text, rewrittenText: resultText, action: actionId, url, provider, model });
    return resultText;

  } else if (provider === 'openrouter_paid') {
    const apiKey = settings.openrouterPaidKey;
    const model = settings.openrouterPaidModel;

    if (!apiKey) throw new Error('OpenRouter Paid API Key is missing. Please add it in the extension options.');
    if (!model) throw new Error('OpenRouter Paid Model Name is missing. Please add it in the extension options.');

    const resultText = await fetchOpenRouter(apiKey, model, prompt, system);
    await saveToHistory({ originalText: text, rewrittenText: resultText, action: actionId, url, provider: 'openrouter_paid', model });
    return resultText;

  } else if (provider === 'google_ai_studio') {
    const apiKey = settings.googleAiStudioKey;
    const model = settings.googleAiStudioModel || 'gemma-4-26b-a4b-it';

    if (!apiKey) throw new Error('Google AI Studio API Key is missing. Please add it in the extension options.');

    const config: any = {
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.MINIMAL,
      },
    };
    if (system) {
      config.systemInstruction = { parts: [{ text: system }] };
    }

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContentStream({
      model,
      config,
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ]
    });

    let resultText = '';
    for await (const chunk of response) {
      if (chunk.text) {
        resultText += chunk.text;
      }
    }

    if (!resultText.trim()) throw new Error('Empty response received from Google AI Studio.');

    await saveToHistory({ originalText: text, rewrittenText: resultText, action: actionId, url, provider, model });
    return resultText;

  } else {
    // OpenRouter Free
    const FREE_MODELS = [
      "google/gemma-4-26b-a4b-it:free",
      "poolside/laguna-xs.2:free",
      "openai/gpt-oss-20b:free",
      "nvidia/nemotron-3-nano-30b-a3b:free",
      "meta-llama/llama-3.2-3b-instruct:free",
    ];

    const apiKey = settings.openrouterKey?.trim() || '';
    if (!apiKey) {
      throw new Error('OpenRouter API Key is missing. Please add it in the extension options.');
    }

    const selectedBase = settings.openrouterModel || 'google/gemma-4-26b-a4b-it:free';
    
    // Clean base model selection
    const baseModel = FREE_MODELS.includes(selectedBase) ? selectedBase : FREE_MODELS[0];
    const otherModels = FREE_MODELS.filter(m => m !== baseModel);
    const modelCycle = [baseModel, ...otherModels];

    // Cycle through all models thrice (max 3 * 5 = 15 attempts)
    const attempts: string[] = [];
    for (let i = 0; i < 3; i++) {
      attempts.push(...modelCycle);
    }

    let lastError: Error | null = null;
    for (let idx = 0; idx < attempts.length; idx++) {
      const currentModel = attempts[idx];
      try {
        console.log(`OpenRouter Free: Attempt ${idx + 1} using model ${currentModel}`);
        const resultText = await fetchOpenRouter(apiKey, currentModel, prompt, system);
        
        // Save using OpenRouter Free provider but with the specific model that succeeded!
        await saveToHistory({ originalText: text, rewrittenText: resultText, action: actionId, url, provider: 'openrouter', model: currentModel });
        return resultText;
      } catch (err: any) {
        console.warn(`OpenRouter Free: Attempt ${idx + 1} (${currentModel}) failed:`, err.message);
        lastError = err;
      }
    }

    throw new Error(`All OpenRouter Free models failed after 3 cycles (15 retries). Last error: ${lastError ? lastError.message : 'Unknown'}`);
  }
}

// Listen for keyboard shortcuts from Chrome manifest.json commands
// These are more reliable than content script keyboard listeners
// Works even when websites intercept keys (Gmail, Notion, etc.)
chrome.commands.onCommand.addListener((command: string) => {
  // Map manifest commands to content script actions
  const actionMap: Record<string, string> = {
    'toggle-menu': 'toggle_menu',
    'improve-writing': 'improve',
    'fix-spelling': 'fix_spelling',
    'paraphrase': 'paraphrase',
  };

  const action = actionMap[command];
  if (!action) return;

  // Send command to active tab's content script
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'COMMAND_TRIGGERED',
        action,
      }).catch((err) => {
        // Content script might not be loaded on this tab
        console.debug(`Command '${command}' sent to tab ${tabs[0].id}, but no response:`, err.message);
      });
    }
  });
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  if (message.type === 'PROCESS_TEXT') {
    const { action, text } = message;
    const url = sender.tab?.url || 'unknown webpage';
    
    callAIProvider(action, text, url)
      .then((rewrittenText) => {
        sendResponse({ success: true, text: rewrittenText });
      })
      .catch((error) => {
        console.error('AI processing error:', error);
        sendResponse({ success: false, error: error.message });
      });

    return true; // Keep message channel open for async response
  }
});
