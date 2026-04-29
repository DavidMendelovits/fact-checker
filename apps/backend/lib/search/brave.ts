import { ClaimType, RawCitation, Source } from "@citecast/shared";
import { SearchProvider } from "./types";

interface BraveWebResult {
  url: string;
  title: string;
  description?: string;
  extra_snippets?: string[];
  meta_url?: {
    hostname?: string;
  };
  age?: string;
}

interface BraveSearchResponse {
  web?: {
    results?: BraveWebResult[];
  };
}

export class BraveSearchProvider implements SearchProvider {
  name = "brave";
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

  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(query: string, _claim: RawCitation): Promise<Source[]> {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", "5");
    url.searchParams.set("text_decorations", "false");

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Brave Search API error: ${response.status} ${response.statusText}`);
    }

    const data: BraveSearchResponse = await response.json();
    const results = data.web?.results ?? [];

    return results.map((result): Source => ({
      url: result.url,
      title: result.title,
      snippet: result.description ?? result.extra_snippets?.[0] ?? "",
      publication: result.meta_url?.hostname,
      date: result.age,
      provider: this.name,
    }));
  }
}
