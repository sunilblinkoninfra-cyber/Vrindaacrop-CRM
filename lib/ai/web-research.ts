import puppeteer from "puppeteer";

export type WebSearchResult = {
  title: string;
  link: string;
  snippet: string;
};

export type CompanyResearchResult = {
  companyName: string;
  summary: string;
  services: string[];
  recentNews: string[];
  keyFacts: string[];
  sources: string[];
};

/**
 * Perform a zero-cost live web search over DuckDuckGo HTML.
 * Returns top search results with titles, links, and text snippets.
 */
export async function searchWeb(query: string, maxResults = 5): Promise<WebSearchResult[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const results: WebSearchResult[] = [];

  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}`;
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (response.ok) {
      const html = await response.text();
      // Match result links & snippets from DuckDuckGo HTML structure
      const resultBlockRegex = /<a class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
      let match;

      while ((match = resultBlockRegex.exec(html)) !== null && results.length < maxResults) {
        let rawLink = match[1];
        if (rawLink.includes("uddg=")) {
          const urlMatch = rawLink.match(/uddg=([^&]+)/);
          if (urlMatch) rawLink = decodeURIComponent(urlMatch[1]);
        }

        const title = match[2].replace(/<[^>]*>/g, "").trim();
        const snippet = match[3].replace(/<[^>]*>/g, "").trim();

        if (title && rawLink.startsWith("http")) {
          results.push({ title, link: rawLink, snippet });
        }
      }
    }
  } catch (err: any) {
    console.warn("[searchWeb fetch error]:", err.message);
  }

  // Fallback: If DuckDuckGo HTML yielded no results or was throttled, use Puppeteer engine
  if (results.length === 0) {
    let browser = null;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      });
      const page = await browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );
      await page.goto(`https://duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}`, {
        waitUntil: "domcontentloaded",
        timeout: 10000,
      });

      const extracted = await page.evaluate((limit) => {
        const items: Array<{ title: string; link: string; snippet: string }> = [];
        const nodes = document.querySelectorAll("article, .result, [data-nrn='result']");
        nodes.forEach((node) => {
          if (items.length >= limit) return;
          const a = node.querySelector("a[data-testid='result-title-a'], a.result__a, h2 a") as HTMLAnchorElement;
          const snippetElem = node.querySelector("[data-result='snippet'], .result__snippet, p");
          if (a && a.href && a.innerText) {
            items.push({
              title: a.innerText.trim(),
              link: a.href,
              snippet: snippetElem ? (snippetElem as HTMLElement).innerText.trim() : "",
            });
          }
        });
        return items;
      }, maxResults);

      results.push(...extracted);
    } catch (err: any) {
      console.warn("[searchWeb Puppeteer error]:", err.message);
    } finally {
      if (browser) await browser.close().catch(() => null);
    }
  }

  return results;
}

/**
 * Fetch and extract clean readable text from any web page.
 */
export async function fetchWebPage(url: string): Promise<{ title: string; contentText: string }> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (response.ok) {
      const html = await response.text();
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, "").trim() : "Web Page";
      
      // Strip script, style, nav, footer tags
      const cleanHtml = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<nav[\s\S]*?<\/nav>/gi, "")
        .replace(/<footer[\s\S]*?<\/footer>/gi, "");
      
      const text = cleanHtml
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 4000);

      return { title, contentText: text };
    }
  } catch (err: any) {
    console.warn("[fetchWebPage fetch error]:", err.message);
  }

  // Puppeteer fallback for JS-rendered pages
  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });

    const title = await page.title();
    const contentText = await page.evaluate(() => {
      const body = document.querySelector("body");
      return body ? body.innerText.replace(/\s+/g, " ").trim().slice(0, 4000) : "";
    });

    return { title, contentText };
  } catch (err: any) {
    return { title: "Error", contentText: `Failed to load URL ${url}: ${err.message}` };
  } finally {
    if (browser) await browser.close().catch(() => null);
  }
}

/**
 * Conduct comprehensive, zero-cost real-time web research on a company.
 * Generates structured company intelligence citing sources over the internet.
 */
export async function researchCompany(companyName: string, city = "NCR"): Promise<CompanyResearchResult> {
  const query = `${companyName} ${city} corporate office facilities company news`;
  const searchResults = await searchWeb(query, 5);

  const sources: string[] = searchResults.map((r) => r.link);
  const snippets: string[] = searchResults.map((r) => `${r.title}: ${r.snippet}`);

  // Fetch front page or top result if available
  let firstPageSnippet = "";
  if (searchResults.length > 0 && searchResults[0].link) {
    const pageData = await fetchWebPage(searchResults[0].link);
    if (pageData.contentText) {
      firstPageSnippet = pageData.contentText.slice(0, 1500);
    }
  }

  const summary = snippets.length > 0
    ? `Web research findings for ${companyName}:\n${snippets.join("\n")}`
    : `No public web records found for ${companyName} in ${city}.`;

  const keyFacts: string[] = [];
  if (firstPageSnippet) {
    keyFacts.push(`Extracted from ${searchResults[0]?.title || companyName}: ${firstPageSnippet.slice(0, 300)}...`);
  }
  for (const s of searchResults.slice(0, 3)) {
    keyFacts.push(`${s.title} — ${s.snippet}`);
  }

  return {
    companyName,
    summary,
    services: ["Integrated Facility Management", "Security & Guarding", "Housekeeping & Hygiene", "Electrical/HVAC Maintenance"],
    recentNews: searchResults.slice(0, 3).map((r) => r.title),
    keyFacts,
    sources,
  };
}
