const PDFDocument = require("pdfkit");

const money = (n) => "Rs. " + Number(n || 0).toFixed(2);
const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "-");

/**
 * Render an invoice to a PDF Buffer.
 * @param {object} invoice  invoice row (with totals + customer fields)
 * @param {object[]} items  invoice_items rows
 * @param {object} company  company_settings row
 * @returns {Promise<Buffer>}
 */
function generateInvoicePdf(invoice, items = [], company = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const left = 50;
      const right = 545;

      // --- Header -------------------------------------------------
      doc
        .fillColor("#1d4ed8")
        .fontSize(24)
        .font("Helvetica-Bold")
        .text(company.company_name || "Your Company", left, 50);
      doc.fillColor("#444").fontSize(9).font("Helvetica");
      if (company.address) doc.text(company.address, left, 80, { width: 250 });
      if (company.email) doc.text(company.email);
      if (company.phone) doc.text(company.phone);
      if (company.tax_number) doc.text("Tax No: " + company.tax_number);

      doc
        .fillColor("#111")
        .fontSize(26)
        .font("Helvetica-Bold")
        .text("INVOICE", 350, 50, { width: 195, align: "right" });
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor("#444")
        .text(invoice.invoice_number || "(draft)", 350, 82, {
          width: 195,
          align: "right",
        })
        .text("Status: " + String(invoice.status || "draft").toUpperCase(), {
          width: 195,
          align: "right",
        });

      // --- Bill To / Dates ---------------------------------------
      let y = 150;
      doc
        .fillColor("#111")
        .fontSize(11)
        .font("Helvetica-Bold")
        .text("Bill To", left, y);
      doc.font("Helvetica").fontSize(10).fillColor("#333");
      doc.text(invoice.customer_name || "N/A", left, y + 16, { width: 250 });
      if (invoice.customer_email)
        doc.text(invoice.customer_email, { width: 250 });
      if (invoice.customer_phone)
        doc.text(invoice.customer_phone, { width: 250 });
      if (invoice.billing_address)
        doc.text(invoice.billing_address, { width: 250 });

      doc.fontSize(10).fillColor("#333");
      doc
        .text("Invoice Date:", 360, y, { width: 95 })
        .text(fmtDate(invoice.invoice_date), 455, y, {
          width: 90,
          align: "right",
        });
      doc
        .text("Due Date:", 360, y + 16, { width: 95 })
        .text(fmtDate(invoice.due_date), 455, y + 16, {
          width: 90,
          align: "right",
        });

      // --- Items table -------------------------------------------
      y = 250;
      const cols = { desc: left, qty: 300, price: 360, tax: 430, total: 470 };
      doc.rect(left, y, right - left, 22).fill("#1d4ed8");
      doc.fillColor("#fff").fontSize(9).font("Helvetica-Bold");
      doc.text("DESCRIPTION", cols.desc + 6, y + 7);
      doc.text("QTY", cols.qty, y + 7, { width: 50, align: "right" });
      doc.text("PRICE", cols.price, y + 7, { width: 60, align: "right" });
      doc.text("TAX", cols.tax, y + 7, { width: 35, align: "right" });
      doc.text("TOTAL", cols.total, y + 7, { width: 70, align: "right" });

      y += 22;
      doc.font("Helvetica").fontSize(9).fillColor("#222");
      items.forEach((it, i) => {
        const rowH = 22;
        if (i % 2 === 1) doc.rect(left, y, right - left, rowH).fill("#f1f5f9");
        doc.fillColor("#222");
        doc.text(it.description || "Item #" + (i + 1), cols.desc + 6, y + 7, {
          width: 240,
        });
        doc.text(String(it.quantity ?? 0), cols.qty, y + 7, {
          width: 50,
          align: "right",
        });
        doc.text(money(it.unit_price), cols.price, y + 7, {
          width: 60,
          align: "right",
        });
        doc.text(Number(it.tax_rate || 0) + "%", cols.tax, y + 7, {
          width: 35,
          align: "right",
        });
        doc.text(money(it.total ?? it.line_total), cols.total, y + 7, {
          width: 70,
          align: "right",
        });
        y += rowH;
        if (y > 680) {
          doc.addPage();
          y = 60;
        }
      });

      doc.moveTo(left, y).lineTo(right, y).strokeColor("#cbd5e1").stroke();

      // --- Totals -------------------------------------------------
      y += 14;
      const totalRow = (label, value, bold) => {
        doc
          .font(bold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(bold ? 11 : 10)
          .fillColor(bold ? "#111" : "#444");
        doc.text(label, 330, y, { width: 120, align: "right" });
        doc.text(value, 455, y, { width: 90, align: "right" });
        y += bold ? 20 : 16;
      };
      totalRow("Subtotal", money(invoice.subtotal));
      totalRow("Discount", "- " + money(invoice.discount));
      totalRow("Tax", money(invoice.tax_amount));
      totalRow("Grand Total", money(invoice.grand_total), true);
      totalRow("Paid", money(invoice.paid_amount));
      totalRow("Balance Due", money(invoice.balance_due), true);

      // --- Notes / Terms -----------------------------------------
      y += 14;
      if (invoice.notes) {
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor("#111")
          .text("Notes", left, y);
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#444")
          .text(invoice.notes, left, y + 13, { width: 260 });
      }
      if (invoice.terms || company.default_terms) {
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor("#111")
          .text("Terms", left, y, { width: 260 });
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#444")
          .text(invoice.terms || company.default_terms, left, y + 13, {
            width: 260,
          });
      }

      doc
        .fontSize(8)
        .fillColor("#94a3b8")
        .text(
          "Generated on " + new Date().toISOString().slice(0, 10),
          left,
          770,
          {
            width: right - left,
            align: "center",
          },
        );

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Render a generic tabular report to a PDF Buffer.
 *
 * @param {string}   title    Report title.
 * @param {{ label:string, value: string|Function }[]} columns
 * @param {object[]} rows
 * @param {{ dateFrom?:string, dateTo?:string }} [filters]  Date filters for the sub-heading.
 * @returns {Promise<Buffer>}
 */
function generateTablePdf(title, columns = [], rows = [], filters = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 40,
        autoFirstPage: true,
        bufferPages: true,
      });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const PAGE_W = 595.28;
      const PAGE_H = 841.89;
      const LEFT = 40;
      const RIGHT = PAGE_W - 40;
      const TABLE_W = RIGHT - LEFT;
      const COL_W = TABLE_W / Math.max(columns.length, 1);
      const ROW_H = 18;
      const HDR_H = 22;
      const FOOTER_H = 30;

      let pageNum = 1;

      // ── Helper: resolve a cell value ─────────────────────────────────────
      const getCell = (col, row) => {
        const v =
          typeof col.value === "function" ? col.value(row) : row[col.value];
        return v === null || v === undefined ? "" : String(v);
      };

      // ── Determine which columns are numeric (right-align them) ───────────
      const isNumeric = columns.map((col) =>
        rows.slice(0, 20).every((row) => {
          const v = getCell(col, row);
          return v === "" || !isNaN(Number(v.replace(/[₹,$, ]/g, "")));
        }),
      );

      // ── Build numeric column totals ──────────────────────────────────────
      const colTotals = columns.map((col, i) => {
        if (!isNumeric[i]) return null;
        return rows.reduce((sum, row) => {
          const v =
            parseFloat(String(getCell(col, row)).replace(/[₹,$, ]/g, "")) || 0;
          return sum + v;
        }, 0);
      });

      // ── Draw footer (page number + generated-on) ─────────────────────────
      const drawFooter = (pageIndex, total) => {
        doc.save();
        doc.fontSize(8).font("Helvetica").fillColor("#94a3b8");
        doc.text(`Page ${pageIndex} of ${total}`, LEFT, PAGE_H - FOOTER_H, {
          width: TABLE_W,
          align: "center",
        });
        doc.text(
          `Generated on ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC  ·  ${rows.length} rows`,
          LEFT,
          PAGE_H - FOOTER_H + 11,
          { width: TABLE_W, align: "center" },
        );
        doc.restore();
      };

      // ── Draw table header row ─────────────────────────────────────────────
      const drawHeader = (y) => {
        doc.rect(LEFT, y, TABLE_W, HDR_H).fill("#1d4ed8");
        doc.fillColor("#fff").fontSize(8.5).font("Helvetica-Bold");
        columns.forEach((c, i) => {
          const align = isNumeric[i] ? "right" : "left";
          doc.text(String(c.label), LEFT + i * COL_W + 4, y + 7, {
            width: COL_W - 8,
            align,
          });
        });
        return y + HDR_H;
      };

      // ─────────────────────────────────────────────────────────────────────
      // Page 1 — Title block
      // ─────────────────────────────────────────────────────────────────────
      doc
        .fillColor("#1d4ed8")
        .fontSize(20)
        .font("Helvetica-Bold")
        .text(title, LEFT, 40);

      const filterParts = [];
      if (filters.dateFrom) filterParts.push(`From: ${filters.dateFrom}`);
      if (filters.dateTo) filterParts.push(`To:   ${filters.dateTo}`);
      const filterLine = filterParts.length
        ? filterParts.join("   |   ")
        : "All dates";

      doc
        .fillColor("#475569")
        .fontSize(9)
        .font("Helvetica")
        .text(`Date range: ${filterLine}`, LEFT, 66);

      doc
        .moveTo(LEFT, 82)
        .lineTo(RIGHT, 82)
        .strokeColor("#e2e8f0")
        .lineWidth(1)
        .stroke();

      // ─────────────────────────────────────────────────────────────────────
      // Table body
      // ─────────────────────────────────────────────────────────────────────
      let y = drawHeader(90);
      doc.font("Helvetica").fontSize(8.5);

      rows.forEach((row, idx) => {
        const cellTexts = columns.map((c) => getCell(c, row));

        // Estimate row height (allow wrapping for long text cells)
        const maxLines = cellTexts.reduce((m, t, i) => {
          if (isNumeric[i]) return m;
          const estimated = Math.ceil(t.length / ((COL_W - 8) / 5));
          return Math.max(m, estimated);
        }, 1);
        const rh = Math.min(maxLines * ROW_H, 54); // cap at 3 lines

        // Page break
        if (y + rh > PAGE_H - FOOTER_H - ROW_H) {
          drawFooter(pageNum, "?"); // placeholder; will be overwritten after doc ends
          doc.addPage();
          pageNum++;
          y = drawHeader(40);
          doc.font("Helvetica").fontSize(8.5);
        }

        if (idx % 2 === 1) doc.rect(LEFT, y, TABLE_W, rh).fill("#f8fafc");
        doc.fillColor("#1e293b");

        cellTexts.forEach((text, i) => {
          const align = isNumeric[i] ? "right" : "left";
          doc.text(text, LEFT + i * COL_W + 4, y + 5, {
            width: COL_W - 8,
            height: rh - 4,
            align,
            ellipsis: true,
            lineBreak: !isNumeric[i],
          });
        });

        y += rh;
      });

      // ── No-data placeholder ───────────────────────────────────────────────
      if (rows.length === 0) {
        doc
          .fillColor("#94a3b8")
          .fontSize(10)
          .text("No data for the selected filters.", LEFT, y + 16);
        y += 40;
      }

      // ── Totals row ────────────────────────────────────────────────────────
      const hasAnyTotal = colTotals.some((t) => t !== null);
      if (hasAnyTotal) {
        // Space + separator
        y += 4;
        doc
          .moveTo(LEFT, y)
          .lineTo(RIGHT, y)
          .strokeColor("#cbd5e1")
          .lineWidth(0.5)
          .stroke();
        y += 2;

        doc.rect(LEFT, y, TABLE_W, HDR_H).fill("#0f172a");
        doc.fillColor("#fff").fontSize(8.5).font("Helvetica-Bold");
        columns.forEach((c, i) => {
          const t = colTotals[i];
          const text =
            t !== null
              ? Number(t.toFixed(2)).toLocaleString("en-IN")
              : i === 0
                ? "TOTALS"
                : "";
          const align = isNumeric[i] ? "right" : "left";
          doc.text(text, LEFT + i * COL_W + 4, y + 7, {
            width: COL_W - 8,
            align,
          });
        });
        y += HDR_H;
      }

      // ── Footer on every page ─────────────────────────────────────────────
      const totalPages = doc.bufferedPageRange
        ? doc.bufferedPageRange().count
        : pageNum;

      // Re-draw all footers now that we know the total page count.
      const range = doc.bufferedPageRange
        ? doc.bufferedPageRange()
        : { start: 0, count: pageNum };
      for (let p = 0; p < range.count; p++) {
        doc.switchToPage(range.start + p);
        drawFooter(p + 1, range.count);
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Render a quotation OR proposal to a PDF Buffer. They share an identical
 * layout — only the title, document-number field name, date label and the
 * optional `scope` block (proposals only) differ.
 */
function generateDocumentPdf(type, docRow, items = [], company = {}) {
  const isProposal = type === "proposal";
  const title = isProposal ? "PROPOSAL" : "QUOTATION";
  const number = isProposal ? docRow.proposal_number : docRow.quotation_number;
  const dateLabel = isProposal ? "Proposal Date" : "Quotation Date";
  const dateValue = isProposal ? docRow.proposal_date : docRow.quotation_date;

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const left = 50;
      const right = 545;

      // --- Header
      doc
        .fillColor("#1d4ed8")
        .fontSize(24)
        .font("Helvetica-Bold")
        .text(company.company_name || "Your Company", left, 50);
      doc.fillColor("#444").fontSize(9).font("Helvetica");
      if (company.address) doc.text(company.address, left, 80, { width: 250 });
      if (company.email) doc.text(company.email);
      if (company.phone) doc.text(company.phone);
      if (company.tax_number) doc.text("Tax No: " + company.tax_number);

      doc
        .fillColor("#111")
        .fontSize(26)
        .font("Helvetica-Bold")
        .text(title, 350, 50, { width: 195, align: "right" });
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor("#444")
        .text(number || "(draft)", 350, 82, { width: 195, align: "right" })
        .text("Status: " + String(docRow.status || "draft").toUpperCase(), {
          width: 195,
          align: "right",
        });

      // --- For / Dates
      let y = 150;
      doc
        .fillColor("#111")
        .fontSize(11)
        .font("Helvetica-Bold")
        .text("Prepared For", left, y);
      doc.font("Helvetica").fontSize(10).fillColor("#333");
      doc.text(docRow.customer_name || "N/A", left, y + 16, { width: 250 });
      if (docRow.customer_email)
        doc.text(docRow.customer_email, { width: 250 });
      if (docRow.customer_phone)
        doc.text(docRow.customer_phone, { width: 250 });
      if (docRow.billing_address)
        doc.text(docRow.billing_address, { width: 250 });

      doc.fontSize(10).fillColor("#333");
      doc
        .text(dateLabel + ":", 360, y, { width: 95 })
        .text(fmtDate(dateValue), 455, y, { width: 90, align: "right" });
      doc
        .text("Valid Until:", 360, y + 16, { width: 95 })
        .text(fmtDate(docRow.valid_until), 455, y + 16, {
          width: 90,
          align: "right",
        });

      // --- Scope (proposals only)
      let scopeBlockEnd = 230;
      if (isProposal && docRow.scope) {
        doc
          .font("Helvetica-Bold")
          .fontSize(11)
          .fillColor("#111")
          .text("Scope", left, 215);
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#444")
          .text(docRow.scope, left, 232, { width: right - left });
        scopeBlockEnd = doc.y + 10;
      }

      // --- Items table
      y = Math.max(250, scopeBlockEnd);
      const cols = { desc: left, qty: 300, price: 360, tax: 430, total: 470 };
      doc.rect(left, y, right - left, 22).fill("#1d4ed8");
      doc.fillColor("#fff").fontSize(9).font("Helvetica-Bold");
      doc.text("DESCRIPTION", cols.desc + 6, y + 7);
      doc.text("QTY", cols.qty, y + 7, { width: 50, align: "right" });
      doc.text("PRICE", cols.price, y + 7, { width: 60, align: "right" });
      doc.text("TAX", cols.tax, y + 7, { width: 35, align: "right" });
      doc.text("TOTAL", cols.total, y + 7, { width: 70, align: "right" });

      y += 22;
      doc.font("Helvetica").fontSize(9).fillColor("#222");
      items.forEach((it, i) => {
        const rowH = 22;
        if (i % 2 === 1) doc.rect(left, y, right - left, rowH).fill("#f1f5f9");
        doc.fillColor("#222");
        doc.text(it.description || "Item #" + (i + 1), cols.desc + 6, y + 7, {
          width: 240,
        });
        doc.text(String(it.quantity ?? 0), cols.qty, y + 7, {
          width: 50,
          align: "right",
        });
        doc.text(money(it.unit_price), cols.price, y + 7, {
          width: 60,
          align: "right",
        });
        doc.text(Number(it.tax_rate || 0) + "%", cols.tax, y + 7, {
          width: 35,
          align: "right",
        });
        doc.text(money(it.total ?? it.line_total), cols.total, y + 7, {
          width: 70,
          align: "right",
        });
        y += rowH;
        if (y > 680) {
          doc.addPage();
          y = 60;
        }
      });

      doc.moveTo(left, y).lineTo(right, y).strokeColor("#cbd5e1").stroke();

      // --- Totals
      y += 14;
      const totalRow = (label, value, bold) => {
        doc
          .font(bold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(bold ? 11 : 10)
          .fillColor(bold ? "#111" : "#444");
        doc.text(label, 330, y, { width: 120, align: "right" });
        doc.text(value, 455, y, { width: 90, align: "right" });
        y += bold ? 20 : 16;
      };
      totalRow("Subtotal", money(docRow.subtotal));
      totalRow("Discount", "- " + money(docRow.discount));
      totalRow("Tax", money(docRow.tax_amount));
      totalRow("Grand Total", money(docRow.grand_total), true);

      // --- Notes / Terms
      y += 14;
      if (docRow.notes) {
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor("#111")
          .text("Notes", left, y);
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#444")
          .text(docRow.notes, left, y + 13, { width: 260 });
      }
      if (docRow.terms || company.default_terms) {
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor("#111")
          .text("Terms", left, y, { width: 260 });
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#444")
          .text(docRow.terms || company.default_terms, left, y + 13, {
            width: 260,
          });
      }

      doc
        .fontSize(8)
        .fillColor("#94a3b8")
        .text(
          "Generated on " + new Date().toISOString().slice(0, 10),
          left,
          770,
          {
            width: right - left,
            align: "center",
          },
        );

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

const generateQuotationPdf = (q, items, company) =>
  generateDocumentPdf("quotation", q, items, company);
const generateProposalPdf = (p, items, company) =>
  generateDocumentPdf("proposal", p, items, company);

module.exports = {
  generateInvoicePdf,
  generateTablePdf,
  generateDocumentPdf,
  generateQuotationPdf,
  generateProposalPdf,
};
