// Tiny TLS helper: loads a self-signed certificate from backend/certs/, or
// generates one on first start. Browsers will warn once ("Your connection is
// not private") — accept the warning and the cert sticks for that origin.
//
// If you want trusted-by-default certs without the warning, install mkcert,
// run  `mkcert -install && mkcert localhost 127.0.0.1`  in this directory,
// then rename mkcert's output to localhost.crt / localhost.key. The same
// loader picks them up.

const fs = require('fs');
const path = require('path');
const selfsigned = require('selfsigned');

const CERT_DIR  = path.join(__dirname, '..', '..', 'certs');
const CERT_FILE = path.join(CERT_DIR, 'localhost.crt');
const KEY_FILE  = path.join(CERT_DIR, 'localhost.key');

function generate() {
  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const pems = selfsigned.generate(attrs, {
    keySize: 2048,
    days: 825,                        // browsers reject certs valid longer than ~825 days
    algorithm: 'sha256',
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' }
        ]
      }
    ]
  });
  if (!fs.existsSync(CERT_DIR)) fs.mkdirSync(CERT_DIR, { recursive: true });
  fs.writeFileSync(CERT_FILE, pems.cert);
  fs.writeFileSync(KEY_FILE, pems.private);
  console.log('[tls] Generated self-signed certificate at ' + CERT_DIR);
  return { cert: pems.cert, key: pems.private };
}

function loadOrGenerateCert() {
  if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE)) {
    return {
      cert: fs.readFileSync(CERT_FILE),
      key:  fs.readFileSync(KEY_FILE)
    };
  }
  return generate();
}

module.exports = { loadOrGenerateCert, CERT_DIR, CERT_FILE, KEY_FILE };
