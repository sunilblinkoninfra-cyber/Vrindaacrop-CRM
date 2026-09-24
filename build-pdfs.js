/**
 * VrindaaCorp Services — Batch Markdown to PDF Compiler
 * 
 * Recursively scans VrindaaCorp_Final_Handover/ for .md files
 * and compiles each into an executive print-ready PDF using 'marked' and 'puppeteer'.
 */

const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const puppeteer = require('puppeteer');

const HANDOVER_DIR = path.join(__dirname, 'VrindaaCorp_Final_Handover');

/**
 * Recursively find all .md files in a directory
 */
function findMarkdownFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(findMarkdownFiles(filePath));
    } else if (file.endsWith('.md')) {
      results.push(filePath);
    }
  }
  return results;
}

/**
 * Decode HTML entities in mermaid code blocks
 */
function unescapeHtml(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Wrap converted HTML with full document structure and custom print stylesheet
 */
function buildHtmlPage(title, bodyContent) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <!-- Mermaid.js for architecture & workflow diagrams -->
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <style>
    @page {
      size: A4;
      margin: 20mm;
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 9.5pt;
      line-height: 1.55;
      color: #334155;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    /* Headings with clean border accents */
    h1, h2, h3, h4, h5, h6 {
      color: #0f172a;
      font-weight: 700;
      page-break-after: avoid;
      break-after: avoid;
      line-height: 1.3;
    }

    h1 {
      font-size: 19pt;
      border-bottom: 2.5px solid #0284c7;
      padding-bottom: 6px;
      margin-top: 0;
      margin-bottom: 14px;
    }

    h2 {
      font-size: 13.5pt;
      border-left: 4.5px solid #0284c7;
      padding-left: 10px;
      margin-top: 22px;
      margin-bottom: 10px;
    }

    h3 {
      font-size: 11pt;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
      margin-top: 16px;
      margin-bottom: 8px;
    }

    h4 {
      font-size: 10pt;
      margin-top: 12px;
      margin-bottom: 6px;
    }

    p {
      margin: 0.6rem 0;
    }

    ul, ol {
      margin: 0.6rem 0;
      padding-left: 1.5rem;
    }

    li {
      margin: 0.25rem 0;
    }

    a {
      color: #0284c7;
      text-decoration: none;
    }

    hr {
      border: none;
      border-top: 1px solid #cbd5e1;
      margin: 1.5rem 0;
    }

    /* Tables: Full width, border collapse, alternating row backgrounds, dark headers, word-wrap */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1.25rem 0;
      page-break-inside: avoid;
      break-inside: avoid;
      table-layout: auto;
      word-wrap: break-word;
      overflow-wrap: break-word;
      font-size: 8.5pt;
      line-height: 1.45;
    }

    th {
      background-color: #f1f5f9;
      color: #0f172a;
      font-weight: 700;
      text-align: left;
      padding: 7px 10px;
      border: 1px solid #cbd5e1;
    }

    td {
      padding: 6px 10px;
      border: 1px solid #e2e8f0;
      color: #334155;
      vertical-align: top;
    }

    tr:nth-child(even) {
      background-color: #f8fafc;
    }

    tr:nth-child(odd) {
      background-color: #ffffff;
    }

    tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* Code & Blocks: Page-break-inside avoid */
    pre {
      background-color: #0f172a;
      color: #f8fafc;
      padding: 10px 14px;
      border-radius: 6px;
      font-family: 'Fira Code', 'Cascadia Code', Consolas, Monaco, 'Courier New', monospace;
      font-size: 8pt;
      line-height: 1.45;
      overflow-x: auto;
      page-break-inside: avoid;
      break-inside: avoid;
      margin: 1rem 0;
      border: 1px solid #1e293b;
      white-space: pre-wrap;
      word-break: break-all;
    }

    code {
      font-family: 'Fira Code', 'Cascadia Code', Consolas, Monaco, 'Courier New', monospace;
      font-size: 8.5pt;
    }

    p code, li code, td code {
      background-color: #f1f5f9;
      color: #0369a1;
      padding: 2px 5px;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
      font-size: 8pt;
    }

    blockquote {
      border-left: 4px solid #0284c7;
      background-color: #f8fafc;
      padding: 0.75rem 1.25rem;
      margin: 1rem 0;
      border-radius: 0 6px 6px 0;
      color: #334155;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    blockquote p {
      margin: 0.25rem 0;
    }

    /* Diagrams: Clean centering and no page break splits */
    .mermaid {
      display: flex;
      justify-content: center;
      margin: 1.5rem 0;
      page-break-inside: avoid;
      break-inside: avoid;
      background: #ffffff;
      padding: 10px;
      border-radius: 6px;
      border: 1px solid #f1f5f9;
    }

    .mermaid svg {
      max-width: 100% !important;
      height: auto !important;
    }

    img {
      max-width: 100%;
      height: auto;
      page-break-inside: avoid;
      break-inside: avoid;
      border-radius: 6px;
      margin: 0.75rem 0;
    }
  </style>
</head>
<body>
  ${bodyContent}

  <script>
    if (window.mermaid) {
      mermaid.initialize({
        startOnLoad: true,
        theme: 'neutral',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        securityLevel: 'loose'
      });
    }
  </script>
</body>
</html>`;
}

async function convertMarkdownToPdf(browser, mdPath) {
  const relPath = path.relative(__dirname, mdPath);
  const pdfPath = mdPath.replace(/\.md$/, '.pdf');
  const fileName = path.basename(mdPath);
  const title = fileName.replace(/\.md$/, '').replace(/_/g, ' ');

  console.log(`[compiling] ${relPath} -> ${path.basename(pdfPath)}...`);

  let content = fs.readFileSync(mdPath, 'utf8');

  // Convert GitHub alerts (> [!NOTE], > [!TIP], etc.)
  content = content.replace(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/gmi, (match, p1) => {
    return `> **[${p1.toUpperCase()}]**:`;
  });

  // Parse markdown to HTML
  let html = marked.parse(content);

  // Transform mermaid code blocks into <div class="mermaid">
  html = html.replace(/<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/gi, (match, code) => {
    return `<div class="mermaid">${unescapeHtml(code.trim())}</div>`;
  });

  const fullHtml = buildHtmlPage(title, html);

  const page = await browser.newPage();
  try {
    await page.setContent(fullHtml, { waitUntil: ['networkidle0', 'domcontentloaded'] });

    // Allow time for Mermaid rendering
    try {
      await page.waitForSelector('.mermaid svg', { timeout: 4000 });
    } catch (e) {
      // Mermaid diagram either wasn't present or completed
    }

    // Generate PDF with A4 geometry, 20mm margins, and bottom-right page numbering
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      margin: {
        top: '20mm',
        right: '20mm',
        bottom: '20mm',
        left: '20mm'
      },
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 8pt; color: #64748b; width: 100%; text-align: right; padding-right: 20mm;">
          Page <span class="pageNumber"></span> of <span class="totalPages"></span>
        </div>
      `
    });

    const stat = fs.statSync(pdfPath);
    const sizeKb = (stat.size / 1024).toFixed(1);
    console.log(`  ✓ SUCCESS: ${path.basename(pdfPath)} generated (${sizeKb} KB)`);
    return { ok: true, mdPath, pdfPath, sizeKb };
  } catch (err) {
    console.error(`  ✗ ERROR on ${relPath}:`, err.message);
    return { ok: false, mdPath, error: err.message };
  } finally {
    await page.close();
  }
}

async function main() {
  console.log('===============================================================');
  console.log('  VrindaaCorp Services — Handover PDF Batch Conversion Engine  ');
  console.log('===============================================================\n');

  if (!fs.existsSync(HANDOVER_DIR)) {
    console.error(`Error: Handover directory not found at ${HANDOVER_DIR}`);
    process.exit(1);
  }

  const mdFiles = findMarkdownFiles(HANDOVER_DIR);
  console.log(`Found ${mdFiles.length} Markdown files in VrindaaCorp_Final_Handover/:\n`);
  mdFiles.forEach((f, i) => console.log(`  ${i + 1}. ${path.relative(__dirname, f)}`));
  console.log('\nLaunching headless browser engine...');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const results = [];
  for (const mdFile of mdFiles) {
    const res = await convertMarkdownToPdf(browser, mdFile);
    results.push(res);
  }

  await browser.close();

  console.log('\n===============================================================');
  console.log('                   BATCH CONVERSION SUMMARY                    ');
  console.log('===============================================================');
  let successCount = 0;
  for (const r of results) {
    if (r.ok) {
      successCount++;
      console.log(`  ✓ ${path.relative(__dirname, r.pdfPath)} (${r.sizeKb} KB)`);
    } else {
      console.log(`  ✗ ${path.relative(__dirname, r.mdPath)}: FAILED (${r.error})`);
    }
  }

  console.log(`\nCompleted: ${successCount} / ${mdFiles.length} PDFs successfully generated.`);

  if (successCount !== mdFiles.length) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal batch-conversion error:', err);
  process.exit(1);
});
