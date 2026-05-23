const supabase = require('../config/supabase');

// Sequential, human-readable document numbers (INV-0001, PAY-0001, QUO-0001,
// PRO-0001). The actual counter lives in a Postgres sequence so concurrent
// requests never collide. We throw on RPC failure instead of falling back to
// a colliding timestamp — duplicate numbers are worse than a 500.

async function callRpc(name, prefix) {
  const { data, error } = await supabase.rpc(name);
  if (error) {
    console.error(`${name} RPC failed:`, error.message);
    throw new Error(`Number generator ${name} unavailable: ${error.message}`);
  }
  if (!data) {
    throw new Error(`Number generator ${name} returned no value`);
  }
  if (typeof data !== 'string' || !data.startsWith(prefix)) {
    throw new Error(`Number generator ${name} returned unexpected value: ${data}`);
  }
  return data;
}

const generateInvoiceNumber   = () => callRpc('next_invoice_number',   'INV-');
const generatePaymentNumber   = () => callRpc('next_payment_number',   'PAY-');
const generateQuotationNumber = () => callRpc('next_quotation_number', 'QUO-');
const generateProposalNumber  = () => callRpc('next_proposal_number',  'PRO-');

module.exports = {
  generateInvoiceNumber,
  generatePaymentNumber,
  generateQuotationNumber,
  generateProposalNumber
};
