const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const API_KEY = process.env.GEMINI_API_KEY;

export default async function handler(req) {
  if (req.method !== "POST") {
    return Response.json(
      {
        success: false,
        error: "Only POST requests are allowed"
      },
      { status: 405 }
    );
  }

  if (!API_KEY) {
    return Response.json(
      {
        success: false,
        error: "GEMINI_API_KEY is missing in Vercel Environment Variables"
      },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();

    const message =
      typeof body.message === "string"
        ? body.message.trim()
        : "";

    if (!message) {
      return Response.json(
        {
          success: false,
          error: "Message is required"
        },
        { status: 400 }
      );
    }

    const history =
      Array.isArray(body.history)
        ? body.history.slice(-20)
        : [];

    const contents = [];

    for (const item of history) {
      if (!item || typeof item.text !== "string") {
        continue;
      }

      const text = item.text.trim();

      if (!text) continue;

      if (item.role === "user") {
        contents.push({
          role: "user",
          parts: [{ text }]
        });
      }

      if (item.role === "assistant") {
        contents.push({
          role: "model",
          parts: [{ text }]
        });
      }
    }

    contents.push({
      role: "user",
      parts: [{ text: message }]
    });

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

    const geminiResponse = await fetch(url, {
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
                `You are Abhay Singh AI.

Developer: Abhay Singh.

Reply helpfully and accurately.
If the user writes Hindi/Hinglish, reply in Hindi/Hinglish.
Use Markdown and code blocks when useful.
Do not claim to be ChatGPT.
Your name is Abhay Singh AI.`
            }
          ]
        },

        contents,

        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096
        }
      })
    });

    const data = await geminiResponse.json();

    if (!geminiResponse.ok) {
      return Response.json(
        {
          success: false,
          error:
            data?.error?.message ||
            "Gemini API error"
        },
        {
          status: geminiResponse.status
        }
      );
    }

    const parts =
      data?.candidates?.[0]?.content?.parts || [];

    const answer = parts
      .filter(part => typeof part.text === "string")
      .map(part => part.text)
      .join("");

    if (!answer) {
      return Response.json(
        {
          success: false,
          error: "Gemini returned an empty response"
        },
        { status: 502 }
      );
    }

    return Response.json({
      success: true,
      message: answer,
      model: MODEL
    });

  } catch (error) {

    console.error("CHAT API ERROR:", error);

    return Response.json(
      {
        success: false,
        error: error?.message || "Server error"
      },
      { status: 500 }
    );
  }
}
