import OpenAI from "openai";
import { ClaimType, Source } from "@citecast/shared";
import { SearchProvider, BaseClaim } from "./types";

export class PerplexityProvider implements SearchProvider {
  name = "perplexity";
  supports: ClaimType[] = [
    "academic_paper",
    "news_article",
    "book",
    "tweet",
    "video",
    "quote",
    "statistic",
    "general",
  ];

  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: "https://api.perplexity.ai",
    });
  }

  async search(query: string, claim: BaseClaim): Promise<Source[]> {
    const prompt = `Find the specific source for this citation from a video transcript.

Claim: ${claim.claim}
Search query: ${query}

Please identify the most likely source(s) for this claim. For each source, provide:
1. The title of the source
2. The URL where it can be found
3. A brief description of what it contains

If you can identify multiple sources, list them in order of relevance. Focus on finding the actual source being referenced.`;

    const response = await this.client.chat.completions.create({
      model: "sonar",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 1024,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    return this.extractSourcesFromResponse(content, claim);
  }

  private extractSourcesFromResponse(content: string, _claim: BaseClaim): Source[] {
    const sources: Source[] = [];

    // Extract URLs from the response
    const urlRegex = /https?:\/\/[^\s\)>\]"',]+/g;
    const urls = content.match(urlRegex) ?? [];

    // Extract title-URL pairs with common patterns like "**Title** - url" or "1. Title (url)"
    const titleUrlPattern =
      /(?:\*\*([^*]+)\*\*|^\d+\.\s+([^\n(]+))[^:]*[:]\s*(https?:\/\/[^\s]+)|(?:\[([^\]]+)\]\((https?:\/\/[^\)]+)\))/gm;

    const pairs: Array<{ title: string; url: string }> = [];
    let match: RegExpExecArray | null;

    while ((match = titleUrlPattern.exec(content)) !== null) {
      const title = (match[1] || match[2] || match[4] || "").trim();
      const url = (match[3] || match[5] || "").trim();
      if (title && url) {
        pairs.push({ title, url });
      }
    }

    if (pairs.length > 0) {
      for (const pair of pairs.slice(0, 5)) {
        sources.push({
          url: pair.url,
          title: pair.title,
          snippet: content.slice(0, 200),
          provider: this.name,
        });
      }
      return sources;
    }

    // Fallback: use URLs found in text with surrounding context as snippet
    for (const url of urls.slice(0, 3)) {
      const urlIndex = content.indexOf(url);
      const contextStart = Math.max(0, urlIndex - 100);
      const contextEnd = Math.min(content.length, urlIndex + 150);
      const context = content.slice(contextStart, contextEnd).trim();

      sources.push({
        url,
        title: _claim.claim.slice(0, 100),
        snippet: context,
        provider: this.name,
      });
    }

    return sources;
  }
}
