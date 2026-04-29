import { ClaimType, Source } from "@citecast/shared";
import { SearchProvider, BaseClaim } from "./types";

interface SemanticScholarPaper {
  paperId: string;
  title: string;
  abstract?: string;
  year?: number;
  authors?: Array<{ name: string }>;
  venue?: string;
  externalIds?: {
    DOI?: string;
    ArXiv?: string;
  };
  openAccessPdf?: {
    url: string;
  };
}

interface SemanticScholarResponse {
  data?: SemanticScholarPaper[];
  total?: number;
}

export class SemanticScholarProvider implements SearchProvider {
  name = "semantic-scholar";
  supports: ClaimType[] = ["academic_paper"];

  private apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  private buildPaperUrl(paper: SemanticScholarPaper): string {
    if (paper.openAccessPdf?.url) return paper.openAccessPdf.url;
    if (paper.externalIds?.DOI) return `https://doi.org/${paper.externalIds.DOI}`;
    if (paper.externalIds?.ArXiv) return `https://arxiv.org/abs/${paper.externalIds.ArXiv}`;
    return `https://www.semanticscholar.org/paper/${paper.paperId}`;
  }

  async search(query: string, _claim: BaseClaim): Promise<Source[]> {
    const url = new URL("https://api.semanticscholar.org/graph/v1/paper/search");
    url.searchParams.set("query", query);
    url.searchParams.set("limit", "5");
    url.searchParams.set("fields", "title,abstract,year,authors,venue,externalIds,openAccessPdf");

    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (this.apiKey) {
      headers["x-api-key"] = this.apiKey;
    }

    const response = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(10_000) });

    if (!response.ok) {
      throw new Error(
        `Semantic Scholar API error: ${response.status} ${response.statusText}`
      );
    }

    const data: SemanticScholarResponse = await response.json();
    const papers = data.data ?? [];

    return papers.map((paper): Source => ({
      url: this.buildPaperUrl(paper),
      title: paper.title,
      snippet: paper.abstract ? paper.abstract.slice(0, 300) : "",
      authors: paper.authors?.map((a) => a.name),
      publication: paper.venue || undefined,
      date: paper.year ? String(paper.year) : undefined,
      provider: this.name,
    }));
  }
}
