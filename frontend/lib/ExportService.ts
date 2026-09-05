import { downloadFile } from "./api";

export interface ExportColumn {
  label: string;
  key: string;
  value?: (row: any) => any;
}

export interface ExportParams {
  title: string;
  filename: string;
  columns: ExportColumn[];
  data: any[];
  isDocument?: boolean;
  documentData?: any; // Used when isDocument is true (e.g. detailed invoice object)
  pdfUrl?: string; // Optional backend PDF endpoint URL
}

export class ExportService {
  /**
   * Universal export function.
   * Runs the appropriate generator based on format, simulates progress, and returns.
   */
  static async export(
    format: string,
    params: ExportParams,
    onProgress: (progress: number) => void,
  ): Promise<void> {
    const sleep = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    // Simulate steps for progress bar
    onProgress(10);
    await sleep(200);
    onProgress(40);
    await sleep(200);
    onProgress(70);

    const { title, filename, columns, data, isDocument, documentData, pdfUrl } =
      params;
    const cleanFormat = format.toLowerCase();

    try {
      switch (cleanFormat) {
        case "csv":
          if (isDocument) {
            this.downloadCSV(
              this.generateDocCSV(documentData),
              `${filename}.csv`,
            );
          } else {
            this.downloadCSV(
              this.generateListCSV(columns, data),
              `${filename}.csv`,
            );
          }
          break;

        case "json":
          const jsonStr = JSON.stringify(
            isDocument ? documentData : data,
            null,
            2,
          );
          this.downloadFileBlob(
            jsonStr,
            `${filename}.json`,
            "application/json",
          );
          break;

        case "xml":
          const xmlStr = isDocument
            ? this.generateDocXML(title, documentData)
            : this.generateListXML(title, columns, data);
          this.downloadFileBlob(xmlStr, `${filename}.xml`, "application/xml");
          break;

        case "xlsx":
        case "excel":
          const xlsStr = isDocument
            ? this.generateDocExcel(title, documentData)
            : this.generateListExcel(title, columns, data);
          this.downloadFileBlob(
            xlsStr,
            `${filename}.xlsx`,
            "application/vnd.ms-excel",
          );
          break;

        case "docx":
        case "word":
          const docStr = isDocument
            ? this.generateDocWord(title, documentData)
            : this.generateListWord(title, columns, data);
          this.downloadFileBlob(
            docStr,
            `${filename}.docx`,
            "application/msword",
          );
          break;

        case "pdf":
          if (pdfUrl) {
            // For reports, invoices, quotations, proposals, audit logs, payments which have backend PDF generators,
            // we download directly from the backend to preserve high-fidelity PDFKit layouts.
            await downloadFile(pdfUrl, `${filename}.pdf`, "application/pdf");
          } else {
            // Fallback to beautiful browser print PDF layout
            this.printData(title, columns, data, isDocument, documentData);
          }
          break;

        case "print":
          this.printData(title, columns, data, isDocument, documentData);
          break;

        case "clipboard":
        case "copy":
          const clipText = isDocument
            ? this.generateDocClipboardText(documentData)
            : this.generateListClipboardText(columns, data);
          await navigator.clipboard.writeText(clipText);
          break;

        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      onProgress(100);
      await sleep(100);
    } catch (err) {
      onProgress(0);
      throw err;
    }
  }

  // ── CSV Helpers ─────────────────────────────────────────────────────────────
  private static generateListCSV(columns: ExportColumn[], data: any[]): string {
    const headers = columns.map((c) => this.escapeCSV(c.label)).join(",");
    const rows = data.map((row) =>
      columns
        .map((c) => {
          const val = c.value ? c.value(row) : row[c.key];
          return this.escapeCSV(val);
        })
        .join(","),
    );
    return [headers, ...rows].join("\r\n");
  }

  private static generateDocCSV(doc: any): string {
    // Generate invoice line items CSV
    const items =
      doc.invoice_items ||
      doc.quotation_items ||
      doc.proposal_items ||
      doc.items ||
      [];
    const headers = [
      "Description",
      "Quantity",
      "Unit Price",
      "Tax Rate (%)",
      "Total",
    ];
    const rows = items.map((item: any) =>
      [
        this.escapeCSV(item.description || item.product_name || "Item"),
        item.quantity,
        item.unit_price,
        item.tax_rate || 0,
        (
          item.quantity *
          item.unit_price *
          (1 + (item.tax_rate || 0) / 100)
        ).toFixed(2),
      ].join(","),
    );
    return [headers.join(","), ...rows].join("\r\n");
  }

  private static escapeCSV(val: any): string {
    if (val === null || val === undefined) return "";
    let str = String(val);
    if (
      str.includes(",") ||
      str.includes('"') ||
      str.includes("\n") ||
      str.includes("\r")
    ) {
      str = '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  private static downloadCSV(content: string, filename: string) {
    const blob = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), content], {
      type: "text/csv;charset=utf-8;",
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      window.URL.revokeObjectURL(url);
    }, 150);
  }

  // ── XML Helpers ─────────────────────────────────────────────────────────────
  private static generateListXML(
    title: string,
    columns: ExportColumn[],
    data: any[],
  ): string {
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<report>\n`;
    xml += `  <title>${this.escapeXML(title)}</title>\n`;
    xml += `  <generated_at>${new Date().toISOString()}</generated_at>\n`;
    xml += `  <rows>\n`;
    data.forEach((row, idx) => {
      xml += `    <row id="${idx + 1}">\n`;
      columns.forEach((c) => {
        const val = c.value ? c.value(row) : row[c.key];
        const tagName = c.key.replace(/[^a-zA-Z0-9_]/g, "_") || "field";
        xml += `      <${tagName}>${this.escapeXML(val)}</${tagName}>\n`;
      });
      xml += `    </row>\n`;
    });
    xml += `  </rows>\n</report>`;
    return xml;
  }

  private static generateDocXML(title: string, doc: any): string {
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<document>\n`;
    xml += `  <type>${this.escapeXML(title)}</type>\n`;
    xml += `  <number>${this.escapeXML(doc.invoice_number || doc.quotation_number || doc.proposal_number || "Draft")}</number>\n`;
    xml += `  <date>${this.escapeXML(doc.invoice_date || doc.quotation_date || doc.proposal_date || "")}</date>\n`;
    xml += `  <customer>\n`;
    xml += `    <name>${this.escapeXML(doc.customer_name || "")}</name>\n`;
    xml += `    <email>${this.escapeXML(doc.customer_email || "")}</email>\n`;
    xml += `    <phone>${this.escapeXML(doc.customer_phone || "")}</phone>\n`;
    xml += `  </customer>\n`;
    xml += `  <totals>\n`;
    xml += `    <subtotal>${doc.subtotal || 0}</subtotal>\n`;
    xml += `    <discount>${doc.discount || 0}</discount>\n`;
    xml += `    <tax_amount>${doc.tax_amount || 0}</tax_amount>\n`;
    xml += `    <grand_total>${doc.grand_total || 0}</grand_total>\n`;
    xml += `  </totals>\n`;
    xml += `  <items>\n`;
    const items =
      doc.invoice_items ||
      doc.quotation_items ||
      doc.proposal_items ||
      doc.items ||
      [];
    items.forEach((item: any, idx: number) => {
      xml += `    <item id="${idx + 1}">\n`;
      xml += `      <description>${this.escapeXML(item.description || item.product_name)}</description>\n`;
      xml += `      <quantity>${item.quantity}</quantity>\n`;
      xml += `      <unit_price>${item.unit_price}</unit_price>\n`;
      xml += `      <tax_rate>${item.tax_rate || 0}</tax_rate>\n`;
      xml += `    </item>\n`;
    });
    xml += `  </items>\n</document>`;
    return xml;
  }

  private static escapeXML(val: any): string {
    if (val === null || val === undefined) return "";
    return String(val)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  // ── Excel (HTML-Spreadsheet) Helpers ────────────────────────────────────────
  private static generateListExcel(
    title: string,
    columns: ExportColumn[],
    data: any[],
  ): string {
    return `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8"/>
        <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${this.escapeXML(title)}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
        <style>
          table { border-collapse: collapse; width: 100%; font-family: 'Segoe UI', Arial, sans-serif; }
          th { background-color: #0071E3; color: white; font-weight: bold; padding: 10px; border: 1px solid #ddd; }
          td { padding: 8px; border: 1px solid #ddd; text-align: left; }
          tr:nth-child(even) { background-color: #f9f9f9; }
        </style>
      </head>
      <body>
        <h2>${this.escapeXML(title)}</h2>
        <p>Exported on: ${new Date().toLocaleString()}</p>
        <table>
          <thead>
            <tr>
              ${columns.map((c) => `<th>${this.escapeXML(c.label)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${data
              .map(
                (row) => `
              <tr>
                ${columns
                  .map((c) => {
                    const val = c.value ? c.value(row) : row[c.key];
                    return `<td>${this.escapeXML(val)}</td>`;
                  })
                  .join("")}
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </body>
      </html>
    `;
  }

  private static generateDocExcel(title: string, doc: any): string {
    const num =
      doc.invoice_number ||
      doc.quotation_number ||
      doc.proposal_number ||
      "Draft";
    const date =
      doc.invoice_date || doc.quotation_date || doc.proposal_date || "";
    const items =
      doc.invoice_items ||
      doc.quotation_items ||
      doc.proposal_items ||
      doc.items ||
      [];

    return `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8"/>
        <style>
          table { border-collapse: collapse; font-family: 'Segoe UI', Arial, sans-serif; }
          td { padding: 6px; border: 1px solid #ddd; }
          .hdr { font-weight: bold; background-color: #f2f2f2; }
          .title { font-size: 16px; font-weight: bold; color: #0071E3; }
        </style>
      </head>
      <body>
        <table>
          <tr>
            <td colspan="5" class="title">${this.escapeXML(title)}</td>
          </tr>
          <tr>
            <td><strong>Number:</strong></td>
            <td>${this.escapeXML(num)}</td>
            <td></td>
            <td><strong>Date:</strong></td>
            <td>${this.escapeXML(date)}</td>
          </tr>
          <tr>
            <td><strong>Bill To:</strong></td>
            <td colspan="4">
              ${this.escapeXML(doc.customer_name || "")} (${this.escapeXML(doc.customer_email || "")})
            </td>
          </tr>
          <tr><td colspan="5"></td></tr>
          <tr class="hdr">
            <td>Description</td>
            <td style="text-align: right;">Quantity</td>
            <td style="text-align: right;">Unit Price</td>
            <td style="text-align: right;">Tax Rate (%)</td>
            <td style="text-align: right;">Total</td>
          </tr>
          ${items
            .map(
              (item: any) => `
            <tr>
              <td>${this.escapeXML(item.description || item.product_name)}</td>
              <td style="text-align: right;">${item.quantity}</td>
              <td style="text-align: right;">${item.unit_price}</td>
              <td style="text-align: right;">${item.tax_rate || 0}%</td>
              <td style="text-align: right;">${(item.quantity * item.unit_price * (1 + (item.tax_rate || 0) / 100)).toFixed(2)}</td>
            </tr>
          `,
            )
            .join("")}
          <tr><td colspan="5"></td></tr>
          <tr>
            <td colspan="3"></td>
            <td><strong>Subtotal:</strong></td>
            <td style="text-align: right;">${Number(doc.subtotal || 0).toFixed(2)}</td>
          </tr>
          ${
            doc.discount
              ? `
          <tr>
            <td colspan="3"></td>
            <td><strong>Discount:</strong></td>
            <td style="text-align: right;">-${Number(doc.discount).toFixed(2)}</td>
          </tr>`
              : ""
          }
          <tr>
            <td colspan="3"></td>
            <td><strong>Tax:</strong></td>
            <td style="text-align: right;">${Number(doc.tax_amount || 0).toFixed(2)}</td>
          </tr>
          <tr>
            <td colspan="3"></td>
            <td><strong>Grand Total:</strong></td>
            <td style="text-align: right; font-weight: bold; color: #0071E3;">${Number(doc.grand_total || 0).toFixed(2)}</td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  // ── Word (HTML-Doc) Helpers ─────────────────────────────────────────────────
  private static generateListWord(
    title: string,
    columns: ExportColumn[],
    data: any[],
  ): string {
    return `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8"/>
        <title>${this.escapeXML(title)}</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; margin: 1in; color: #333; }
          h1 { color: #0071E3; font-size: 22px; border-bottom: 2px solid #0071E3; padding-bottom: 5px; }
          table { border-collapse: collapse; width: 100%; margin-top: 15px; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; font-size: 12px; }
          th { background-color: #f2f2f2; font-weight: bold; }
        </style>
      </head>
      <body>
        <h1>${this.escapeXML(title)}</h1>
        <p style="font-size: 11px; color: #777;">Exported: ${new Date().toLocaleString()}</p>
        <table>
          <thead>
            <tr>
              ${columns.map((c) => `<th>${this.escapeXML(c.label)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${data
              .map(
                (row) => `
              <tr>
                ${columns
                  .map((c) => {
                    const val = c.value ? c.value(row) : row[c.key];
                    return `<td>${this.escapeXML(val)}</td>`;
                  })
                  .join("")}
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </body>
      </html>
    `;
  }

  private static generateDocWord(title: string, doc: any): string {
    const num =
      doc.invoice_number ||
      doc.quotation_number ||
      doc.proposal_number ||
      "Draft";
    const date =
      doc.invoice_date || doc.quotation_date || doc.proposal_date || "";
    const items =
      doc.invoice_items ||
      doc.quotation_items ||
      doc.proposal_items ||
      doc.items ||
      [];

    return `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8"/>
        <title>${this.escapeXML(title)} - ${this.escapeXML(num)}</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; margin: 1in; color: #333; }
          .title { color: #0071E3; font-size: 24px; font-weight: bold; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          td.meta { border: none; padding: 4px; font-size: 12px; }
          table.items { border: 1px solid #ddd; margin-top: 20px; }
          table.items th, table.items td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
          table.items th { background-color: #f2f2f2; font-weight: bold; }
          .totals { text-align: right; margin-top: 20px; font-size: 13px; }
          .notes { font-size: 11px; color: #666; margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="title">${this.escapeXML(title)}</div>
        <table style="width: 100%; margin-bottom: 20px;">
          <tr>
            <td class="meta" style="width: 50%;">
              <strong>Bill To:</strong><br/>
              ${this.escapeXML(doc.customer_name || "")}<br/>
              ${this.escapeXML(doc.customer_email || "")}<br/>
              ${this.escapeXML(doc.customer_phone || "")}
            </td>
            <td class="meta" style="width: 50%; text-align: right; vertical-align: top;">
              <strong>Document No:</strong> ${this.escapeXML(num)}<br/>
              <strong>Date:</strong> ${this.escapeXML(date)}<br/>
              <strong>Status:</strong> ${this.escapeXML(doc.status || "Draft")}
            </td>
          </tr>
        </table>

        <h3>Line Items</h3>
        <table class="items">
          <thead>
            <tr>
              <th>Description</th>
              <th style="text-align: right; width: 80px;">Qty</th>
              <th style="text-align: right; width: 100px;">Price</th>
              <th style="text-align: right; width: 80px;">Tax Rate</th>
              <th style="text-align: right; width: 120px;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map(
                (item: any) => `
              <tr>
                <td>${this.escapeXML(item.description || item.product_name)}</td>
                <td style="text-align: right;">${item.quantity}</td>
                <td style="text-align: right;">${item.unit_price}</td>
                <td style="text-align: right;">${item.tax_rate || 0}%</td>
                <td style="text-align: right;">${(item.quantity * item.unit_price * (1 + (item.tax_rate || 0) / 100)).toFixed(2)}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>

        <div class="totals">
          <p>Subtotal: ${Number(doc.subtotal || 0).toFixed(2)}</p>
          ${doc.discount ? `<p>Discount: -${Number(doc.discount).toFixed(2)}</p>` : ""}
          <p>Tax: ${Number(doc.tax_amount || 0).toFixed(2)}</p>
          <p style="font-size: 16px; color: #0071E3; font-weight: bold;">Grand Total: ${Number(doc.grand_total || 0).toFixed(2)}</p>
        </div>

        ${doc.notes ? `<div class="notes"><strong>Notes:</strong><br/>${this.escapeXML(doc.notes)}</div>` : ""}
        ${doc.terms ? `<div class="notes"><strong>Terms &amp; Conditions:</strong><br/>${this.escapeXML(doc.terms)}</div>` : ""}
      </body>
      </html>
    `;
  }

  // ── Clipboard Helpers ───────────────────────────────────────────────────────
  private static generateListClipboardText(
    columns: ExportColumn[],
    data: any[],
  ): string {
    const headers = columns.map((c) => c.label).join("\t");
    const rows = data.map((row) =>
      columns
        .map((c) => {
          const val = c.value ? c.value(row) : row[c.key];
          return val !== null && val !== undefined
            ? String(val).replace(/\t/g, " ")
            : "";
        })
        .join("\t"),
    );
    return [headers, ...rows].join("\n");
  }

  private static generateDocClipboardText(doc: any): string {
    const num =
      doc.invoice_number ||
      doc.quotation_number ||
      doc.proposal_number ||
      "Draft";
    const date =
      doc.invoice_date || doc.quotation_date || doc.proposal_date || "";
    const items =
      doc.invoice_items ||
      doc.quotation_items ||
      doc.proposal_items ||
      doc.items ||
      [];

    let text = `DOCUMENT SUMMARY\n`;
    text += `Number: ${num}\nDate: ${date}\nCustomer: ${doc.customer_name || ""}\n`;
    text += `Subtotal: ${doc.subtotal || 0}\nGrand Total: ${doc.grand_total || 0}\n\nITEMS:\n`;
    items.forEach((item: any) => {
      text += `- ${item.description || item.product_name} x ${item.quantity} @ ${item.unit_price}\n`;
    });
    return text;
  }

  // ── Print Fallback ──────────────────────────────────────────────────────────
  private static printData(
    title: string,
    columns: ExportColumn[],
    data: any[],
    isDocument?: boolean,
    documentData?: any,
  ) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    let html = "";
    if (isDocument && documentData) {
      html = this.generateDocWord(title, documentData);
    } else {
      html = this.generateListWord(title, columns, data);
    }

    printWindow.document.write(html);
    printWindow.document.close();

    // Give images or fonts a second to load before triggering print
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 500);
  }

  // ── Generic Trigger Blob Download ──────────────────────────────────────────
  private static downloadFileBlob(
    content: string,
    filename: string,
    mimeType: string,
  ) {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      window.URL.revokeObjectURL(url);
    }, 150);
  }
}
