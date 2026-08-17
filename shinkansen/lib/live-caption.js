// live-caption.js — Gemini Audio STT & Translation for Chrome Live Captions

import { LANG_LABELS } from './storage.js';

const DEFAULT_AUDIO_MODEL = 'gemini-3.1-flash-lite';

/**
 * Translates a slice of audio into the target language using Gemini Multimodal Audio input.
 *
 * @param {object} params
 * @param {string} params.base64Audio - base64 encoded audio slice (WebM/Opus)
 * @param {string} params.mimeType - MIME type, e.g. "audio/webm;codecs=opus"
 * @param {string} params.targetLanguage - target language code (e.g. 'zh-TW', 'zh-CN', 'ja', 'en')
 * @param {string} params.apiKey - user's Gemini API Key
 * @param {string} [params.model] - model override
 * @param {string} [params.previousContext] - previous translated subtitle context for smooth continuation
 * @returns {Promise<{ original: string, translated: string, usage: object, model: string }>}
 */
export async function translateLiveAudioChunk({
  base64Audio,
  mimeType = 'audio/webm',
  targetLanguage = 'zh-TW',
  apiKey,
  model,
  previousContext = '',
}) {
  if (!apiKey) {
    throw new Error('Gemini API Key is required for Live Caption translation.');
  }

  const resolvedModel = model || DEFAULT_AUDIO_MODEL;
  const targetLangLabel = LANG_LABELS[targetLanguage] || '繁體中文（台灣）';

  const systemInstructionText = `You are a real-time speech-to-text and subtitle translator for live streams/videos.
Your task is to transcribe speech from the audio slice and translate it into ${targetLangLabel}.

Rules:
1. If the audio contains spoken voice, output a JSON object with:
   {"original": "transcribed speech in original language", "translated": "fluent subtitle translation in ${targetLangLabel}"}
2. If there is no speech, silence, background music only, or unintelligible noise, output:
   {"original": "", "translated": ""}
3. Output raw JSON only. Do not wrap in markdown code blocks.
4. Use spoken, natural subtitle phrasing suitable for live streams.`;

  let promptText = `Please transcribe this audio slice and translate speech to ${targetLangLabel}. Return raw JSON only.`;
  if (previousContext) {
    promptText = `[Recent subtitle context: "${previousContext}"]\n` + promptText + ` Continue the translation smoothly if the sentence is ongoing.`;
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(resolvedModel)}:generateContent`;

  const payload = {
    systemInstruction: {
      parts: [{ text: systemInstructionText }],
    },
    contents: [
      {
        role: 'user',
        parts: [
          { text: promptText },
          {
            inlineData: {
              mimeType: mimeType.split(';')[0] || 'audio/webm',
              data: base64Audio,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 512,
      responseMimeType: 'application/json',
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini Audio Translation API Error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const usageMetadata = data?.usageMetadata || {};

  let result = { original: '', translated: '' };
  try {
    const cleanJson = rawText.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    if (cleanJson) {
      result = JSON.parse(cleanJson);
    }
  } catch (err) {
    result = {
      original: '',
      translated: rawText.trim(),
    };
  }

  return {
    original: (result.original || '').trim(),
    translated: (result.translated || '').trim(),
    usage: {
      inputTokens: usageMetadata.promptTokenCount || 0,
      outputTokens: (usageMetadata.candidatesTokenCount || 0) + (usageMetadata.thoughtsTokenCount || 0),
      cachedTokens: usageMetadata.cachedContentTokenCount || 0,
    },
    model: resolvedModel,
  };
}
