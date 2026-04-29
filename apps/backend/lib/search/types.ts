import { ClaimType, RawCitation, Source } from "@citecast/shared";

export interface SearchProvider {
  name: string;
  supports: ClaimType[];
  search(query: string, claim: RawCitation): Promise<Source[]>;
}
