import html2pdf from "html2pdf.js";
import { Download } from "lucide-react";
import { Button } from "../ui/button";

/**
 * Button that captures a DOM element and converts it to PDF via html2pdf.js.
 * Adds a styled header ("CompanyIntel Report") and footer with source date.
 *
 * Props:
 *  - targetRef: React ref to the DOM element to capture
 *  - companyName: company name for the filename and header
 *  - reportDate: date string for the footer
 */
export function PDFExport({ targetRef, companyName, reportDate }) {
  const handleExport = () => {
    const element = targetRef.current;
    if (!element) return;

    // Create a wrapper with header and footer for the PDF
    const wrapper = document.createElement("div");
    wrapper.style.fontFamily = "system-ui, -apple-system, sans-serif";

    // Header
    const header = document.createElement("div");
    header.style.cssText =
      "text-align: center; padding: 16px 0 12px; border-bottom: 2px solid #3b82f6; margin-bottom: 16px;";
    header.innerHTML = `
      <div style="font-size: 20px; font-weight: 700; color: #1e293b;">CompanyIntel Report</div>
      ${companyName ? `<div style="font-size: 14px; color: #64748b; margin-top: 4px;">${companyName}</div>` : ""}
      ${reportDate ? `<div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">${reportDate}</div>` : ""}
    `;

    // Clone the target content
    const content = element.cloneNode(true);
    content.style.cssText = "padding: 0; margin: 0;";

    // Footer
    const footer = document.createElement("div");
    footer.style.cssText =
      "text-align: center; padding: 12px 0 0; border-top: 1px solid #e2e8f0; margin-top: 16px; font-size: 10px; color: #94a3b8;";
    footer.textContent = `Sources verified as of ${reportDate || new Date().toLocaleDateString()}`;

    wrapper.appendChild(header);
    wrapper.appendChild(content);
    wrapper.appendChild(footer);

    const opt = {
      margin: [10, 10, 15, 10],
      filename: `${companyName || "report"}-intel-report.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    };

    html2pdf().set(opt).from(wrapper).save();
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <Download className="h-4 w-4 mr-2" />
      Export PDF
    </Button>
  );
}

export default PDFExport;
