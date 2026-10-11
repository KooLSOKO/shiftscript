import { GoogleGenAI } from "@google/genai";
// Both transcription and analysis use the current free-tier-capable Flash-Lite.
export const defaultModel = "gemini-3.5-flash-lite";
export async function geminiJson(
  { input, schema, instruction, maxTokens = 6000, model, timeout = 45000 },
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
        model: model || process.env.GEMINI_MODEL || defaultModel,
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
      { timeout, maxRetries: 0 },
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
    // Interactions SDK errors use statusCode; older generateContent errors use status.
    const status = Number(e.statusCode ?? e.status);
    if (Number.isInteger(status) && status >= 400 && status <= 599) {
      const diagnostic = String(e.error?.message || e.message || "");
      console.error(
        "Gemini request failed:",
        JSON.stringify({
          status,
          model: /^gemini-[a-z0-9_.-]{1,80}$/i.test(
            model || process.env.GEMINI_MODEL || defaultModel,
          )
            ? model || process.env.GEMINI_MODEL || defaultModel
            : "custom-model",
          category: /schema|response[_ .-]?format/i.test(diagnostic)
            ? "response_schema"
            : /model/i.test(diagnostic)
              ? "model_access"
              : /generation[_ .-]?config|max[_ .-]?output[_ .-]?tokens/i.test(
                    diagnostic,
                  )
                ? "generation_config"
                : status === 429
                  ? "quota_or_rate_limit"
                  : "provider_request",
        }),
      );
    }
    if ([401, 403].includes(status))
      throw Object.assign(
        new Error(
          "Gemini rejected the API key or project access. Create a key in Google AI Studio and check its API restrictions.",
        ),
        { status: 503 },
      );
    if (status === 429)
      throw Object.assign(
        new Error(
          "Gemini free-tier quota or rate limit reached. Wait and retry; check the project limits in Google AI Studio.",
        ),
        { status: 429 },
      );
    if (status === 404)
      throw Object.assign(
        new Error(
          model
            ? "The assistant model is unavailable to this project. Check ASSISTANT_MODEL and model access in AI Studio."
            : "The configured Gemini model is unavailable to this project. Check GEMINI_MODEL and model access in AI Studio.",
        ),
        { status: 503 },
      );
    if ([400, 422].includes(status))
      throw Object.assign(
        new Error(
          "Gemini rejected the request format. Check the Gemini request failed entry in Vercel Logs for its status and category.",
        ),
        { status: 502 },
      );
    if ([500, 503, 504].includes(status))
      throw Object.assign(
        new Error(
          "Gemini is temporarily unavailable. Wait a moment and try again.",
        ),
        { status: 503 },
      );
    if (e instanceof SyntaxError)
      throw Object.assign(
        new Error(
          "Gemini returned an incomplete or invalid JSON reply. Try again; if this persists, the assistant response format needs checking.",
        ),
        { status: 502 },
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
