import pRetry from 'p-retry';

const SEMANTIC_SCHOLAR_URL = 'https://api.semanticscholar.org/graph/v1/paper/search';

export interface RetrievedPaper {
  title: string;
  abstract: string | null;
  authors: string;
  year: number | null;
  doi: string;
  citationCount: number;
}

export async function fetchAcademicPapers(query: string, limit = 3, _logger: any): Promise<RetrievedPaper[]> {
  try {
    const fetchWithRetry = async () => {
      const poolSize = Math.max(limit * 3, 10);
      const url = `${SEMANTIC_SCHOLAR_URL}?query=${encodeURIComponent(query)}&limit=${poolSize}&fields=title,abstract,authors,year,externalIds,citationCount`;

      const response = await fetch(url, {
        headers: { 'User-Agent': 'Thesium-Research-Bot/1.0' }
      });

      if (!response.ok) {
        if (response.status === 429) throw new Error('Scholar rate-limited');
        throw new Error(`Scholar ${response.status}`);
      }

      const data: any = await response.json();
      return data.data || [];
    };

    // Silent retries — no logging on each attempt
    const rawPapers = await pRetry(fetchWithRetry, { retries: 3 });

    const parsedPapers = rawPapers.map((paper: any) => ({
      title: paper.title || 'Untitled',
      abstract: paper.abstract || null,
      authors: paper.authors ? paper.authors.map((a: any) => a.name).join(', ') : 'Unknown',
      year: paper.year || null,
      doi: (paper.externalIds && paper.externalIds.DOI) ? paper.externalIds.DOI : 'No DOI provided',
      citationCount: paper.citationCount || 0
    }));

    parsedPapers.sort((a: any, b: any) => {
      const scoreA = a.citationCount + (a.year ? (a.year - 2000) * 10 : 0);
      const scoreB = b.citationCount + (b.year ? (b.year - 2000) * 10 : 0);
      return scoreB - scoreA;
    });

    return parsedPapers.slice(0, limit);
  } catch {
    // Total failure — silent, returns empty (pipeline continues without papers)
    return [];
  }
}
