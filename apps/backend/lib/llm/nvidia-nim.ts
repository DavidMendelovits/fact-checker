import OpenAI from "openai";
import { TranscriptSegment, RawCitation } from "@citecast/shared";
import { LLMProvider } from "./types";
import { EXTRACTION_SYSTEM_PROMPT, buildExtractionPrompt } from "./prompts/extract";
import { parseLLMResponse } from "./parse";

export class NvidiaNimProvider implements LLMProvider {
  name = "nvidia-nim";
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: "https://integrate.api.nvidia.com/v1",
    });
    this.model = model;
  }

  async extractCitations(transcript: TranscriptSegment[]): Promise<RawCitation[]> {
    const userMessage = buildExtractionPrompt(transcript);

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.1,
      max_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.warn("[nvidia-nim] Empty response from LLM");
      return [];
    }

    return parseLLMResponse(content);
  }
}
