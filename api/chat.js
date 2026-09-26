"use strict";

/*
=========================================================
AURA AI - GEMINI API SERVER
Vercel Serverless Function
=========================================================
*/

const DEFAULT_PRIMARY_MODEL =
  "gemini-3.8-flash";

const DEFAULT_FALLBACK_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash"
];

const MAX_ATTACHMENT_SIZE =
  8 * 1024 * 1024;

const MAX_TOTAL_ATTACHMENT_SIZE =
  12 * 1024 * 1024;

const MAX_ATTACHMENTS = 5;

const ALLOWED_MIME_TYPES = new Set([
  /* Images */
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",

  /* Audio */
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/flac",

  /* Video */
  "video/mp4",
  "video/webm",
  "video/mov",
  "video/quicktime",

  /* Documents */
  "application/pdf",

  /* Text */
  "text/plain",
  "text/csv",
  "application/json",
  "text/html",
  "text/xml",
  "application/xml",
  "text/markdown"
]);

/* =========================================================
   MAIN HANDLER
========================================================= */

module.exports = async function handler(req, res) {

  if (req.method !== "POST") {

    return res.status(405).json({
      success: false,
      error: "Method not allowed."
    });
  }

  const apiKey =
    process.env.GEMINI_API_KEY;

  if (!apiKey) {

    return res.status(500).json({
      success: false,
      error:
        "GEMINI_API_KEY is not configured in Vercel Environment Variables."
    });
  }

  let body;

  try {

    body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : (req.body || {});

  } catch {

    return res.status(400).json({
      success: false,
      error: "Invalid JSON request."
    });
  }

  const message =
    typeof body.message === "string"
      ? body.message.trim()
      : "";

  const history =
    Array.isArray(body.history)
      ? body.history
      : [];

  const attachments =
    Array.isArray(body.attachments)
      ? body.attachments
      : [];

  if (!message && !attachments.length) {

    return res.status(400).json({
      success: false,
      error: "Message or attachment is required."
    });
  }

  if (attachments.length > MAX_ATTACHMENTS) {

    return res.status(400).json({
      success: false,
      error:
        `Maximum ${MAX_ATTACHMENTS} attachments are allowed.`
    });
  }

  /* =======================================================
     BUILD CONTENT
  ======================================================= */

  let userParts = [];

  if (message) {

    userParts.push({
      text: message
    });
  }

  let totalAttachmentSize = 0;

  for (const attachment of attachments) {

    if (!attachment ||
        typeof attachment !== "object") {

      return res.status(400).json({
        success: false,
        error: "Invalid attachment."
      });
    }

    const mimeType =
      String(
        attachment.mimeType || ""
      ).toLowerCase();

    const data =
      extractBase64(
        attachment.data
      );

    if (!mimeType || !data) {

      return res.status(400).json({
        success: false,
        error:
          `Invalid attachment: ${attachment.name || "file"}`
      });
    }

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {

      return res.status(400).json({
        success: false,
        error:
          `Unsupported file type: ${mimeType}`
      });
    }

    const approximateSize =
      Math.floor(
        data.length * 0.75
      );

    if (
      approximateSize >
      MAX_ATTACHMENT_SIZE
    ) {

      return res.status(413).json({
        success: false,
        error:
          `${attachment.name || "File"} is too large. Maximum is 8 MB.`
      });
    }

    totalAttachmentSize +=
      approximateSize;

    if (
      totalAttachmentSize >
      MAX_TOTAL_ATTACHMENT_SIZE
    ) {

      return res.status(413).json({
        success: false,
        error:
          "Total attachment size cannot exceed 12 MB."
      });
    }

    userParts.push({
      inlineData: {
        mimeType,
        data
      }
    });
  }

  /* =======================================================
     HISTORY
  ======================================================= */

  const contents = [];

  const safeHistory =
    history
      .filter(item =>
        item &&
        (
          item.role === "user" ||
          item.role === "assistant" ||
          item.role === "model"
        ) &&
        typeof item.text === "string" &&
        item.text.trim()
      )
      .slice(-20);

  for (const item of safeHistory) {

    contents.push({
      role:
        item.role === "assistant"
          ? "model"
          : "user",

      parts: [
        {
          text:
            item.text.slice(0, 20000)
        }
      ]
    });
  }

  contents.push({
    role: "user",
    parts: userParts
  });

  /* =======================================================
     MODELS
  ======================================================= */

  const primaryModel =
    process.env.GEMINI_MODEL ||
    DEFAULT_PRIMARY_MODEL;

  const configuredFallbacks =
    process.env.GEMINI_FALLBACK_MODELS
      ? process.env.GEMINI_FALLBACK_MODELS
          .split(",")
          .map(model => model.trim())
          .filter(Boolean)
      : DEFAULT_FALLBACK_MODELS;

  const models =
    [...new Set([
      primaryModel,
      ...configuredFallbacks
    ])];

  const attempts = [];

  /* =======================================================
     MODEL LOOP
  ======================================================= */

  for (const model of models) {

    let retryCount = 0;

    while (retryCount <= 2) {

      try {

        const result =
          await callGemini({
            apiKey,
            model,
            contents
          });

        if (result.ok) {

          return res.status(200).json({
            success: true,
            text: result.text,
            usedModel: model,
            attempts
          });
        }

        attempts.push({
          model,
          status: result.status,
          error: result.error,
          retry: retryCount
        });

        /*
          Authentication/configuration errors should
          not be hidden by trying random models.
        */

        if (
          result.status === 400 ||
          result.status === 401 ||
          result.status === 403
        ) {

          return res.status(
            result.status
          ).json({
            success: false,
            error: cleanGeminiError(
              result.error,
              result.status
            ),
            code:
              result.status === 401 ||
              result.status === 403
                ? "API_KEY_ERROR"
                : "BAD_REQUEST",
            attempts
          });
        }

        /*
          Retry temporary failures.
        */

        if (
          isRetryableStatus(
            result.status
          ) &&
          retryCount < 2
        ) {

          await sleep(
            getBackoffDelay(
              retryCount,
              result.retryAfter
            )
          );

          retryCount++;
          continue;
        }

        /*
          Model unavailable/not found:
          immediately move to fallback.
        */

        break;

      } catch (error) {

        attempts.push({
          model,
          status: 0,
          error: error.message,
          retry: retryCount
        });

        if (retryCount < 2) {

          await sleep(
            getBackoffDelay(
              retryCount
            )
          );

          retryCount++;
          continue;
        }

        break;
      }
    }
  }

  /* =======================================================
     FINAL ERROR
  ======================================================= */

  const last =
    attempts[attempts.length - 1];

  let errorMessage =
    "AURA AI is temporarily unavailable. Please try again.";

  if (last && last.error) {

    const lower =
      last.error.toLowerCase();

    if (
      lower.includes("quota") ||
      lower.includes("rate") ||
      lower.includes("429")
    ) {

      errorMessage =
        "Gemini API rate limit reached. Please try again in a moment.";
    }

    else if (
      lower.includes("high demand") ||
      lower.includes("overloaded") ||
      lower.includes("503")
    ) {

      errorMessage =
        "The AI models are currently experiencing high demand. Please try again shortly.";
    }

    else if (
      lower.includes("api key") ||
      lower.includes("authentication")
    ) {

      errorMessage =
        "Gemini API key is invalid or not configured correctly.";
    }
  }

  return res.status(503).json({
    success: false,
    error: errorMessage,
    code: "ALL_MODELS_FAILED",
    attempts
  });
};

/* =========================================================
   GEMINI CALL
========================================================= */

async function callGemini({
  apiKey,
  model,
  contents
}) {

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const body = {

    systemInstruction: {
      parts: [
        {
          text: `
You are AURA AI, a helpful general-purpose AI assistant.

Your job is to provide accurate, useful and natural answers.

You can communicate in English, Hindi, and Hinglish.
Match the user's language when appropriate.

When the user provides an image, audio file, PDF, document,
or other supported attachment, analyze the attachment carefully
and answer based on its actual contents.

Do not claim that you performed an action that you did not perform.

For programming questions, provide clean and practical code.

For important factual topics, clearly distinguish facts,
uncertainty, and assumptions.

Keep answers clear and useful unless the user asks for detail.
          `.trim()
        }
      ]
    },

    contents,

    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096
    }
  };

  const response =
    await fetch(url, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },

      body: JSON.stringify(body)
    });

  const rawText =
    await response.text();

  let data;

  try {
    data =
      JSON.parse(rawText);
  } catch {
    data = null;
  }

  if (!response.ok) {

    const error =
      data?.error?.message ||
      rawText ||
      `Gemini request failed (${response.status})`;

    return {
      ok: false,
      status: response.status,
      error,
      retryAfter:
        response.headers.get(
          "retry-after"
        )
    };
  }

  const text =
    extractResponseText(data);

  if (!text) {

    return {
      ok: false,
      status: 502,
      error:
        "Gemini returned an empty response."
    };
  }

  return {
    ok: true,
    text
  };
}

/* =========================================================
   RESPONSE EXTRACTION
========================================================= */

function extractResponseText(data) {

  const candidates =
    data?.candidates || [];

  let result = "";

  for (const candidate of candidates) {

    const parts =
      candidate?.content?.parts || [];

    for (const part of parts) {

      if (
        typeof part?.text === "string"
      ) {
        result += part.text;
      }
    }
  }

  return result.trim();
}

/* =========================================================
   BASE64
========================================================= */

function extractBase64(value) {

  if (
    typeof value !== "string"
  ) {
    return "";
  }

  if (
    value.startsWith("data:")
  ) {

    const comma =
      value.indexOf(",");

    if (comma === -1) {
      return "";
    }

    return value
      .slice(comma + 1)
      .replace(/\s/g, "");
  }

  return value.replace(/\s/g, "");
}

/* =========================================================
   RETRY
========================================================= */

function isRetryableStatus(status) {

  return [
    408,
    409,
    429,
    500,
    502,
    503,
    504,
    529
  ].includes(status);
}

function getBackoffDelay(
  retryNumber,
  retryAfter
) {

  const retrySeconds =
    Number(
      parseFloat(retryAfter)
    );

  if (
    Number.isFinite(retrySeconds) &&
    retrySeconds > 0
  ) {

    return Math.min(
      retrySeconds * 1000,
      10000
    );
  }

  const base =
    Math.pow(
      2,
      retryNumber
    ) * 1000;

  const jitter =
    Math.floor(
      Math.random() * 500
    );

  return Math.min(
    base + jitter,
    10000
  );
}

function sleep(ms) {

  return new Promise(
    resolve => setTimeout(resolve, ms)
  );
}

/* =========================================================
   ERROR CLEANING
========================================================= */

function cleanGeminiError(
  error,
  status
) {

  if (
    status === 401 ||
    status === 403
  ) {

    return "Gemini API key is invalid, expired, or does not have permission.";
  }

  if (status === 400) {

    return (
      "Gemini rejected the request. " +
      (error || "Please check your message or attachment.")
    );
  }

  return (
    error ||
    "Gemini API request failed."
  );
    }
