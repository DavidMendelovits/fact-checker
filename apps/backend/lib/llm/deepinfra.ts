import OpenAI from "openai";
import { TranscriptSegment, RawCitation, RawArticleCitation } from "@citecast/shared";
import { LLMProvider } from "./types";
import { EXTRACTION_SYSTEM_PROMPT, buildExtractionPrompt } from "./prompts/extract";
import { ARTICLE_EXTRACTION_SYSTEM_PROMPT, buildArticleExtractionPrompt } from "./prompts/extract-article";
import { parseLLMResponse, parseArticleLLMResponse } from "./parse";

export class DeepInfraProvider implements LLMProvider {
  name = "deepinfra";
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: "https://api.deepinfra.com/v1/openai",
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
      console.warn("[deepinfra] Empty response from LLM");
      return [];
    }

    return parseLLMResponse(content);
  }

  async extractArticleCitations(text: string, title?: string): Promise<RawArticleCitation[]> {
    const userMessage = buildArticleExtractionPrompt(text, title);

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: ARTICLE_EXTRACTION_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.1,
      max_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.warn("[deepinfra] Empty response from LLM (article)");
      return [];
    }

    return parseArticleLLMResponse(content);
  }
}
