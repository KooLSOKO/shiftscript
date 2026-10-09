import { GoogleGenAI } from "@google/genai";
// Both transcription and analysis use the current free-tier-capable Flash-Lite.
export const defaultModel = "gemini-3.5-flash-lite";
export async function geminiJson(
  { input, schema, instruction, maxTokens = 6000 },
  clientOverride,
) {
  if (!clientOverride && !process.env.GEMINI_API_KEY)
    throw Object.assign(
      new Error(
        "Add GEMINI_API_KEY to your .env and restart. You can use AI_PROVIDER=sample for the included example.",
      ),
      { status: 503 },
    );
  try {
    const client =
      clientOverride || new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await client.interactions.create(
      {
        model: process.env.GEMINI_MODEL || defaultModel,
        store: false,
        input,
        system_instruction: instruction,
        generation_config: { max_output_tokens: maxTokens, temperature: 0.2 },
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema,
        },
      },
      { timeout: 45000, maxRetries: 0 },
    );
    if (response.status && response.status !== "completed")
      throw Object.assign(
        new Error("Gemini did not complete the request. Try a shorter input."),
        { status: 502 },
      );
    // Support SDK output_text and the raw text output representation.
    const text =
      response.output_text ||
      response.outputs
        ?.filter((p) => p.type === "text")
        .map((p) => p.text)
        .join("");
    if (!text)
      throw Object.assign(
        new Error(
          "Gemini returned no usable text. Try a clearer recording or transcript.",
        ),
        { status: 502 },
      );
    return JSON.parse(text);
  } catch (e) {
    if ([401, 403].includes(e.status))
      throw Object.assign(
        new Error(
          "Gemini rejected the API key or project access. Create a key in Google AI Studio and check its API restrictions.",
        ),
        { status: 503 },
      );
    if (e.status === 429)
      throw Object.assign(
        new Error(
          "Gemini free-tier quota or rate limit reached. Wait and retry; check the project limits in Google AI Studio.",
        ),
        { status: 429 },
      );
    if (e.status === 404)
      throw Object.assign(
        new Error(
          "The configured Gemini model is unavailable to this project. Check GEMINI_MODEL and model access in AI Studio.",
        ),
        { status: 503 },
      );
    if (
      e.name === "TimeoutError" ||
      e.name === "APIConnectionTimeoutError" ||
      e.name === "AbortError"
    )
      throw Object.assign(
        new Error(
          "Gemini took too long. Try a shorter transcript or recording.",
        ),
        { status: 504 },
      );
    if (e.status === 502) throw e;
    throw Object.assign(
      new Error(
        "Gemini returned invalid data or is unavailable. Please retry with a shorter input.",
      ),
      { status: 502 },
    );
  }
}
