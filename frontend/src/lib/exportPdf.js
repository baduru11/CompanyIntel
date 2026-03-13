/**
 * Generate a clean, print-formatted PDF from report data.
 * Creates an off-screen HTML document with white background and proper typography,
 * then converts it to PDF via html2pdf.js.
 */

function esc(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Convert basic markdown to inline HTML for PDF rendering.
 * Handles: **bold**, ### headings, bullet lists, and paragraphs.
 */
function mdToHtml(text) {
  if (!text) return "";
  return text
    // Headings: ### Title → <h3>
    .replace(/^### (.+)$/gm, '<h3 style="font-size:13px;font-weight:700;color:#111;margin:12px 0 4px 0;">$1</h3>')
    .replace(/^#### (.+)$/gm, '<h4 style="font-size:12px;font-weight:600;color:#333;margin:8px 0 4px 0;">$1</h4>')
    // Bold: **text** → <strong>
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Bullet lists: - item → <li>
    .replace(/^[-*] (.+)$/gm, '<li style="margin-left:16px;margin-bottom:2px;">$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul style="list-style:disc;padding-left:8px;margin:4px 0;">$1</ul>')
    // Citation markers: [1] → superscript
    .replace(/\[(\d+)\]/g, '<sup style="font-size:9px;color:#888;">[$1]</sup>')
    // Paragraphs: double newline → <br><br>
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

function sectionHtml(title, content, confidence) {
  const confBadge =
    confidence != null
      ? `<span style="font-size:11px;color:#888;margin-left:8px;">(confidence: ${Math.round(confidence * 100)}%)</span>`
      : "";
  const body = content
    ? `<div style="line-height:1.7;color:#333;">${mdToHtml(content)}</div>`
    : `<div style="color:#999;font-style:italic;">No data available.</div>`;
  return `
    <div style="margin-bottom:28px;page-break-inside:avoid;">
      <h2 style="font-size:16px;font-weight:700;color:#111;margin:0 0 8px 0;padding-bottom:6px;border-bottom:1px solid #e5e7eb;">
        ${esc(title)}${confBadge}
      </h2>
      ${body}
    </div>`;
}

function textOf(v) {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v.content) return v.content;
  return "";
}

export async function exportReportPdf(data) {
  const report = data?.report || data || {};
  const companyName = report.company_name || report.name || "Company";

  // Metadata
  const founded = report.founded || "";
  const hq = report.headquarters || "";
  const headcount = report.headcount || "";
  const stage = report.funding_stage || "";
  const linkedinUrl = report.linkedin_url || "";
  const crunchbaseUrl = report.crunchbase_url || "";

  // Sections
  const overview = textOf(report.overview);
  const funding = textOf(report.funding);
  const people = textOf(report.key_people);
  const product = textOf(report.product_technology);
  const news = textOf(report.recent_news);
  const competitors = textOf(report.competitors);
  const redFlags = textOf(report.red_flags);
  const market = textOf(report.market_opportunity);
  const businessModel = textOf(report.business_model);
  const compAdvantages = textOf(report.competitive_advantages);
  const traction = textOf(report.traction);
  const risks = textOf(report.risks);

  // Structured data
  const fundingRounds = report.funding_rounds || [];
  const peopleEntries = report.people_entries || [];
  const newsItems = report.news_items || [];
  const competitorEntries = report.competitor_entries || [];
  const redFlagEntries = report.red_flag_entries || [];
  const riskEntries = report.risk_entries || [];

  // Build metadata row
  const metaItems = [];
  if (founded) metaItems.push(`<strong>Founded:</strong> ${esc(founded)}`);
  if (hq) metaItems.push(`<strong>HQ:</strong> ${esc(hq)}`);
  if (headcount) metaItems.push(`<strong>Headcount:</strong> ${esc(headcount)}`);
  if (stage) metaItems.push(`<strong>Stage:</strong> ${esc(stage)}`);
  const metaHtml = metaItems.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:16px 32px;padding:12px 16px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:24px;font-size:13px;color:#555;">
        ${metaItems.join("")}
       </div>`
    : "";

  // Links
  const linksHtml = (linkedinUrl || crunchbaseUrl)
    ? `<div style="font-size:12px;color:#666;margin-bottom:20px;">
        ${linkedinUrl ? `<a href="${esc(linkedinUrl)}" style="color:#0A66C2;margin-right:16px;">LinkedIn</a>` : ""}
        ${crunchbaseUrl ? `<a href="${esc(crunchbaseUrl)}" style="color:#0288D1;">Crunchbase</a>` : ""}
       </div>`
    : "";

  // Funding rounds table
  let fundingTableHtml = "";
  if (fundingRounds.length > 0) {
    const rows = fundingRounds
      .map(
        (r) =>
          `<tr>
            <td style="padding:6px 12px;border-bottom:1px solid #eee;">${esc(r.date || "—")}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #eee;">${esc(r.stage || "—")}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #eee;font-weight:600;">${esc(r.amount || "—")}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #eee;">${esc((r.investors || []).join(", ") || "—")}</td>
          </tr>`
      )
      .join("");
    fundingTableHtml = `
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:12px;margin-bottom:8px;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#666;text-transform:uppercase;">Date</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#666;text-transform:uppercase;">Stage</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#666;text-transform:uppercase;">Amount</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#666;text-transform:uppercase;">Investors</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // People cards
  let peopleCardsHtml = "";
  if (peopleEntries.length > 0) {
    peopleCardsHtml = `<div style="margin-top:12px;">` +
      peopleEntries
        .map(
          (p) =>
            `<div style="padding:8px 0;border-bottom:1px solid #f0f0f0;">
              <strong style="font-size:13px;">${esc(p.name)}</strong>
              ${p.title ? `<span style="color:#666;font-size:12px;"> — ${esc(p.title)}</span>` : ""}
              ${p.linkedin_url ? `<a href="${esc(p.linkedin_url)}" style="color:#0A66C2;font-size:11px;margin-left:6px;">LinkedIn</a>` : ""}
              ${p.background ? `<div style="font-size:12px;color:#555;margin-top:2px;">${esc(p.background)}</div>` : ""}
              ${p.prior_exits?.length ? `<div style="font-size:11px;color:#059669;margin-top:2px;">Prior exits: ${esc(p.prior_exits.join(", "))}</div>` : ""}
            </div>`
        )
        .join("") +
      `</div>`;
  }

  // Competitor table
  let competitorTableHtml = "";
  if (competitorEntries.length > 0) {
    const rows = competitorEntries
      .map(
        (c) =>
          `<tr>
            <td style="padding:6px 12px;border-bottom:1px solid #eee;font-weight:600;">${esc(c.name || "—")}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #eee;">${esc(c.description || "—")}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #eee;">${esc(c.funding || "—")}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #eee;">${esc(c.overlap || "—")}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #eee;">${esc(c.differentiator || "—")}</td>
          </tr>`
      )
      .join("");
    competitorTableHtml = `
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:12px;margin-bottom:8px;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#666;text-transform:uppercase;">Company</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#666;text-transform:uppercase;">Description</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#666;text-transform:uppercase;">Funding</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#666;text-transform:uppercase;">Overlap</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#666;text-transform:uppercase;">Differentiator</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // News items
  let newsListHtml = "";
  if (newsItems.length > 0) {
    newsListHtml = `<div style="margin-top:12px;">` +
      newsItems
        .map(
          (n) => {
            const sentiment = n.sentiment === "positive" ? "🟢" : n.sentiment === "negative" ? "🔴" : "⚪";
            return `<div style="padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:12px;">
              <span>${sentiment}</span>
              <strong>${esc(n.title)}</strong>
              ${n.date ? `<span style="color:#888;margin-left:8px;">${esc(n.date)}</span>` : ""}
              ${n.snippet ? `<div style="color:#555;margin-top:2px;">${esc(n.snippet)}</div>` : ""}
            </div>`;
          }
        )
        .join("") +
      `</div>`;
  }

  // Red flags
  let redFlagsListHtml = "";
  if (redFlagEntries.length > 0) {
    redFlagsListHtml = `<div style="margin-top:12px;">` +
      redFlagEntries
        .map(
          (f) =>
            `<div style="padding:8px 12px;margin-bottom:6px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;font-size:12px;">
              <span style="font-weight:600;color:#dc2626;text-transform:uppercase;font-size:10px;">${esc(f.severity || "medium")}</span>
              <div style="color:#333;margin-top:2px;">${esc(f.content)}</div>
            </div>`
        )
        .join("") +
      `</div>`;
  }

  // Risk entries
  let risksListHtml = "";
  if (riskEntries.length > 0) {
    risksListHtml = `<div style="margin-top:12px;">` +
      riskEntries
        .map(
          (r) =>
            `<div style="padding:8px 12px;margin-bottom:6px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;font-size:12px;">
              <span style="font-weight:600;color:#d97706;text-transform:uppercase;font-size:10px;">${esc(r.category || "general")} — ${esc(r.severity || "medium")}</span>
              <div style="color:#333;margin-top:2px;">${esc(r.content)}</div>
            </div>`
        )
        .join("") +
      `</div>`;
  }

  // Assemble full HTML document
  const html = `
    <div id="pdf-export" style="font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:#111;max-width:700px;margin:0 auto;padding:0;">
      <!-- Header -->
      <div style="margin-bottom:24px;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;">
          ${report.logo_url ? `<img src="${esc(report.logo_url)}" alt="" style="width:36px;height:36px;border-radius:8px;border:1px solid #e5e7eb;object-fit:contain;background:white;" onerror="this.style.display='none'" />` : ""}
          <h1 style="font-size:24px;font-weight:800;color:#0f172a;margin:0;">${esc(companyName)}</h1>
        </div>
        <div style="font-size:11px;color:#94a3b8;">Intelligence Report — Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
        ${linksHtml}
      </div>

      ${metaHtml}

      ${sectionHtml("Overview", overview, report.overview?.confidence)}

      ${sectionHtml("Funding History", funding, report.funding?.confidence)}
      ${fundingTableHtml}

      ${sectionHtml("Key People", people, report.key_people?.confidence)}
      ${peopleCardsHtml}

      ${sectionHtml("Product & Technology", product, report.product_technology?.confidence)}

      ${market ? sectionHtml("Market Opportunity", market, report.market_opportunity?.confidence) : ""}
      ${businessModel ? sectionHtml("Business Model", businessModel, report.business_model?.confidence) : ""}
      ${compAdvantages ? sectionHtml("Competitive Advantages", compAdvantages, report.competitive_advantages?.confidence) : ""}
      ${traction ? sectionHtml("Traction", traction, report.traction?.confidence) : ""}

      ${sectionHtml("Recent News", news, report.recent_news?.confidence)}
      ${newsListHtml}

      ${sectionHtml("Competitors", competitors, report.competitors?.confidence)}
      ${competitorTableHtml}

      ${risks ? sectionHtml("Risks", risks, report.risks?.confidence) : ""}
      ${risksListHtml}

      ${sectionHtml("Red Flags", redFlags, report.red_flags?.confidence)}
      ${redFlagsListHtml}

      <!-- Footer -->
      <div style="margin-top:40px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#94a3b8;text-align:center;">
        Generated by CompanyIntel — Private Company Intelligence Agent
      </div>
    </div>`;

  // Create off-screen container
  const container = document.createElement("div");
  container.style.cssText = "position:fixed;left:-9999px;top:0;width:210mm;background:white;-webkit-print-color-adjust:exact;";
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    const { default: html2pdf } = await import("html2pdf.js");
    await html2pdf()
      .set({
        margin: [12, 12, 16, 12],
        filename: `${companyName || "report"}-intel-report.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] },
        enableLinks: true,
      })
      .from(container.firstElementChild)
      .save();
  } finally {
    document.body.removeChild(container);
  }
}
