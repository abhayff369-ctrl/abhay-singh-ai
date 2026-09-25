export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Only POST requests are allowed"
    });
  }

  const API_KEY = process.env.GEMINI_API_KEY;
  const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

  if (!API_KEY) {
    return res.status(500).json({
      success: false,
      error: "GEMINI_API_KEY is not configured in Vercel"
    });
  }

  try {
    const body = req.body || {};
    const message =
      typeof body.message === "string"
        ? body.message.trim()
        : "";

    if (!message) {
      return res.status(400).json({
        success: false,
        error: "Message is required"
      });
    }

    const contents = [
      {
        role: "user",
        parts: [
          {
            text: message
          }
        ]
      }
    ];

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": API_KEY
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text:
                  "You are Abhay Singh AI, a helpful AI assistant created by Abhay Singh. Answer clearly and naturally. Support Hindi, Hinglish and English."
              }
            ]
          },
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error:
          data?.error?.message ||
          "Gemini API request failed",
        details: data?.error || null
      });
    }

    const answer =
      data?.candidates?.[0]?.content?.parts
        ?.map(p => p.text || "")
        .join("")
        .trim();

    if (!answer) {
      return res.status(502).json({
        success: false,
        error: "Gemini returned an empty response",
        raw: data
      });
    }

    return res.status(200).json({
      success: true,
      message: answer,
      model: MODEL
    });

  } catch (error) {
    console.error("CHAT ERROR:", error);

    return res.status(500).json({
      success: false,
      error: error?.message || "Internal server error"
    });
  }
}
