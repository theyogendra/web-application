const { Resend } = require('resend');
const env = require('../config/env');
const supabase = require('../config/supabase');
const { escapeHtml } = require('../utils/escape');

// A single Resend client, created only when a key is configured.
// Without a key the service degrades gracefully: every email is still
// recorded in email_logs with status 'skipped' so the workflow never breaks.
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

// All `${...}` interpolations in HTML templates go through `h(...)` so a
// customer name like "<script>" can never break out of the markup.
const h = escapeHtml;
const money = (n) => 'Rs. ' + Number(n || 0).toFixed(2);
const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '-');

async function getCompany() {
  try {
    const { data, error } = await supabase
      .from('company_settings').select('*').limit(1).maybeSingle();
    if (error) console.error('getCompany lookup failed:', error.message);
    return data || {};
  } catch (e) {
    console.error('getCompany threw:', e.message);
    return {};
  }
}

async function logEmail(fields) {
  try {
    const { data, error } = await supabase.from('email_logs').insert([fields]).select().single();
    if (error) console.error('Failed to write email log:', error.message);
    return data || null;
  } catch (err) {
    console.error('Failed to write email log:', err.message);
    return null;
  }
}

/**
 * Low-level send. Always records an email_logs row with the final status.
 * Never throws — callers get { success, skipped?, message } back.
 */
async function sendEmail({ to, subject, html, emailType, module: mod, recordId, attachments }) {
  const base = {
    to_email: to || '',
    subject: subject || '',
    body: html || '',
    email_type: emailType || null,
    module: mod || 'Email',
    record_id: recordId || null,
    provider: 'resend'
  };

  if (!to) {
    await logEmail({ ...base, status: 'failed', error_message: 'No recipient email address' });
    return { success: false, message: 'No recipient email address' };
  }

  if (!resend) {
    await logEmail({ ...base, status: 'skipped', error_message: 'RESEND_API_KEY not configured' });
    return { success: false, skipped: true, message: 'Email skipped: RESEND_API_KEY not configured' };
  }

  try {
    const payload = { from: env.FROM_EMAIL, to: [to], subject, html };
    if (env.REPLY_TO_EMAIL) payload.replyTo = env.REPLY_TO_EMAIL;
    if (attachments && attachments.length) payload.attachments = attachments;

    const { data, error } = await resend.emails.send(payload);
    if (error) throw new Error(error.message || JSON.stringify(error));

    await logEmail({
      ...base,
      status: 'sent',
      provider_message_id: (data && data.id) || null,
      sent_at: new Date().toISOString()
    });
    return { success: true, id: (data && data.id) || null };
  } catch (err) {
    await logEmail({ ...base, status: 'failed', error_message: err.message });
    return { success: false, message: err.message };
  }
}

// --- HTML templates --------------------------------------------------
// Every dynamic value goes through `h()` — never inline a raw `${...}`.

function layout(company, title, bodyHtml) {
  const name = h(company.company_name || 'Your Company');
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#1e293b">
  <div style="max-width:600px;margin:0 auto;padding:24px">
    <div style="background:#1d4ed8;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
      <div style="font-size:20px;font-weight:bold">${name}</div>
      <div style="font-size:13px;opacity:.85">${h(title)}</div>
    </div>
    <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0">
      ${bodyHtml}
    </div>
    <div style="text-align:center;color:#94a3b8;font-size:11px;padding:16px">
      ${h(company.email || '')}${company.phone ? ' &middot; ' + h(company.phone) : ''}
    </div>
  </div></body></html>`;
}

function totalsTable(invoice) {
  const row = (l, v, strong) =>
    `<tr><td style="padding:4px 0;color:#64748b">${l}</td>
     <td style="padding:4px 0;text-align:right;${strong ? 'font-weight:bold;color:#0f172a' : ''}">${v}</td></tr>`;
  return `<table style="width:100%;font-size:14px;margin-top:8px">
    ${row('Subtotal', money(invoice.subtotal))}
    ${row('Discount', '- ' + money(invoice.discount))}
    ${row('Tax', money(invoice.tax_amount))}
    ${row('Grand Total', money(invoice.grand_total), true)}
    ${row('Paid', money(invoice.paid_amount))}
    ${row('Balance Due', money(invoice.balance_due), true)}
  </table>`;
}

function invoiceSentTemplate(company, invoice) {
  const body = `
    <p>Hi ${h(invoice.customer_name || 'there')},</p>
    <p>Please find your invoice <strong>${h(invoice.invoice_number || '')}</strong> below.
       A PDF copy is attached for your records.</p>
    <p style="font-size:14px">
      <strong>Invoice Date:</strong> ${fmtDate(invoice.invoice_date)}<br/>
      <strong>Due Date:</strong> ${fmtDate(invoice.due_date)}
    </p>
    ${totalsTable(invoice)}
    <p style="margin-top:16px">Thank you for your business.</p>`;
  return {
    subject: `Invoice ${invoice.invoice_number || ''} from ${company.company_name || 'Your Company'}`,
    html: layout(company, 'Invoice', body)
  };
}

function paymentReceiptTemplate(company, invoice, payment) {
  const body = `
    <p>Hi ${h(invoice.customer_name || 'there')},</p>
    <p>We have received your payment. Thank you!</p>
    <table style="width:100%;font-size:14px;margin-top:8px">
      <tr><td style="padding:4px 0;color:#64748b">Receipt No.</td>
          <td style="padding:4px 0;text-align:right">${h(payment.payment_number || '')}</td></tr>
      <tr><td style="padding:4px 0;color:#64748b">Invoice</td>
          <td style="padding:4px 0;text-align:right">${h(invoice.invoice_number || '')}</td></tr>
      <tr><td style="padding:4px 0;color:#64748b">Payment Date</td>
          <td style="padding:4px 0;text-align:right">${fmtDate(payment.payment_date)}</td></tr>
      <tr><td style="padding:4px 0;color:#64748b">Method</td>
          <td style="padding:4px 0;text-align:right">${h(payment.payment_method || '')}</td></tr>
      <tr><td style="padding:4px 0;color:#64748b;font-weight:bold">Amount Paid</td>
          <td style="padding:4px 0;text-align:right;font-weight:bold;color:#16a34a">${money(payment.amount)}</td></tr>
      <tr><td style="padding:4px 0;color:#64748b">Balance Due</td>
          <td style="padding:4px 0;text-align:right">${money(invoice.balance_due)}</td></tr>
    </table>`;
  return {
    subject: `Payment Receipt ${payment.payment_number || ''} - ${invoice.invoice_number || ''}`,
    html: layout(company, 'Payment Receipt', body)
  };
}

function overdueReminderTemplate(company, invoice) {
  const body = `
    <p>Hi ${h(invoice.customer_name || 'there')},</p>
    <p>This is a friendly reminder that invoice <strong>${h(invoice.invoice_number || '')}</strong>
       was due on <strong>${fmtDate(invoice.due_date)}</strong> and has an outstanding balance.</p>
    ${totalsTable(invoice)}
    <p style="margin-top:16px">Please arrange payment at your earliest convenience.
       If you have already paid, kindly ignore this message.</p>`;
  return {
    subject: `Reminder: Invoice ${invoice.invoice_number || ''} is overdue`,
    html: layout(company, 'Payment Reminder', body)
  };
}

function invoicePaidTemplate(company, invoice) {
  const body = `
    <p>Hi ${h(invoice.customer_name || 'there')},</p>
    <p>Invoice <strong>${h(invoice.invoice_number || '')}</strong> is now fully paid.
       Thank you for settling your account.</p>
    ${totalsTable(invoice)}`;
  return {
    subject: `Invoice ${invoice.invoice_number || ''} paid in full`,
    html: layout(company, 'Invoice Paid', body)
  };
}

function docTotalsTable(d) {
  const row = (l, v, strong) =>
    `<tr><td style="padding:4px 0;color:#64748b">${l}</td>
     <td style="padding:4px 0;text-align:right;${strong ? 'font-weight:bold;color:#0f172a' : ''}">${v}</td></tr>`;
  return `<table style="width:100%;font-size:14px;margin-top:8px">
    ${row('Subtotal', money(d.subtotal))}
    ${row('Discount', '- ' + money(d.discount))}
    ${row('Tax', money(d.tax_amount))}
    ${row('Grand Total', money(d.grand_total), true)}
  </table>`;
}

function quotationSentTemplate(company, quotation) {
  const body = `
    <p>Hi ${h(quotation.customer_name || 'there')},</p>
    <p>Please find quotation <strong>${h(quotation.quotation_number || '')}</strong> below.
       A PDF is attached for your records.</p>
    <p style="font-size:14px">
      <strong>Quotation Date:</strong> ${fmtDate(quotation.quotation_date)}<br/>
      <strong>Valid Until:</strong> ${fmtDate(quotation.valid_until)}
    </p>
    ${docTotalsTable(quotation)}
    <p style="margin-top:16px">If you have any questions, simply reply to this email.</p>`;
  return {
    subject: `Quotation ${quotation.quotation_number || ''} from ${company.company_name || 'Your Company'}`,
    html: layout(company, 'Quotation', body)
  };
}

function proposalSentTemplate(company, proposal) {
  const scopeBlock = proposal.scope
    ? `<p style="font-size:14px;color:#475569;white-space:pre-wrap;background:#f8fafc;padding:10px;border-radius:6px">${h(proposal.scope)}</p>`
    : '';
  const body = `
    <p>Hi ${h(proposal.customer_name || 'there')},</p>
    <p>Please find proposal <strong>${h(proposal.proposal_number || '')}</strong> below.
       A PDF is attached.</p>
    <p style="font-size:14px">
      <strong>Proposal Date:</strong> ${fmtDate(proposal.proposal_date)}<br/>
      <strong>Valid Until:</strong> ${fmtDate(proposal.valid_until)}
    </p>
    ${scopeBlock}
    ${docTotalsTable(proposal)}
    <p style="margin-top:16px">Looking forward to working with you.</p>`;
  return {
    subject: `Proposal ${proposal.proposal_number || ''} from ${company.company_name || 'Your Company'}`,
    html: layout(company, 'Proposal', body)
  };
}

// --- High-level senders ---------------------------------------------

async function sendInvoiceEmail(invoice, pdfBuffer) {
  const company = await getCompany();
  const { subject, html } = invoiceSentTemplate(company, invoice);
  const attachments = pdfBuffer
    ? [{ filename: `${invoice.invoice_number || 'invoice'}.pdf`, content: pdfBuffer.toString('base64') }]
    : undefined;
  return sendEmail({
    to: invoice.customer_email, subject, html,
    emailType: 'Invoice Sent', module: 'Invoices', recordId: invoice.id, attachments
  });
}

async function sendPaymentReceiptEmail(invoice, payment) {
  const company = await getCompany();
  const { subject, html } = paymentReceiptTemplate(company, invoice, payment);
  return sendEmail({
    to: invoice.customer_email, subject, html,
    emailType: 'Payment Receipt', module: 'Payments', recordId: payment.id
  });
}

async function sendOverdueReminderEmail(invoice) {
  const company = await getCompany();
  const { subject, html } = overdueReminderTemplate(company, invoice);
  return sendEmail({
    to: invoice.customer_email, subject, html,
    emailType: 'Overdue Reminder', module: 'Invoices', recordId: invoice.id
  });
}

async function sendInvoicePaidEmail(invoice) {
  const company = await getCompany();
  const { subject, html } = invoicePaidTemplate(company, invoice);
  return sendEmail({
    to: invoice.customer_email, subject, html,
    emailType: 'Invoice Paid', module: 'Invoices', recordId: invoice.id
  });
}

async function sendQuotationEmail(quotation, pdfBuffer) {
  const company = await getCompany();
  const { subject, html } = quotationSentTemplate(company, quotation);
  const attachments = pdfBuffer
    ? [{ filename: `${quotation.quotation_number || 'quotation'}.pdf`, content: pdfBuffer.toString('base64') }]
    : undefined;
  return sendEmail({
    to: quotation.customer_email, subject, html,
    emailType: 'Quotation Sent', module: 'Quotations', recordId: quotation.id, attachments
  });
}

async function sendProposalEmail(proposal, pdfBuffer) {
  const company = await getCompany();
  const { subject, html } = proposalSentTemplate(company, proposal);
  const attachments = pdfBuffer
    ? [{ filename: `${proposal.proposal_number || 'proposal'}.pdf`, content: pdfBuffer.toString('base64') }]
    : undefined;
  return sendEmail({
    to: proposal.customer_email, subject, html,
    emailType: 'Proposal Sent', module: 'Proposals', recordId: proposal.id, attachments
  });
}

module.exports = {
  sendEmail,
  sendInvoiceEmail,
  sendPaymentReceiptEmail,
  sendOverdueReminderEmail,
  sendInvoicePaidEmail,
  sendQuotationEmail,
  sendProposalEmail,
  isConfigured: () => !!resend
};
