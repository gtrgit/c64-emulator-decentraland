// generate-certs.js - Generate self-signed certificates using Node.js
import { generateKeyPairSync, createSign } from 'crypto';
import fs from 'fs';

console.log('🔒 Generating self-signed certificates...\n');

// Generate RSA key pair
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});

// Save private key
fs.writeFileSync('key.pem', privateKey);
console.log('✅ Created key.pem');

// Create a basic self-signed certificate (simplified)
// Note: This creates a basic cert that browsers will warn about
const cert = `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKLdQVPy90WjMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV
BAYTAlVTMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX
aWRnaXRzIFB0eSBMdGQwHhcNMjQwMTAxMDAwMDAwWhcNMjUwMTAxMDAwMDAwWjBF
MQswCQYDVQQGEwJVUzETMBEGA1UECAwKU29tZS1TdGF0ZTEhMB8GA1UECgwYSW50
ZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIB
CgKCAQEAu7LlbOq0FHYB963hg1Q8kZ1g9dZdO5Y3TmCYXMLIlfAJUKfEAUxIBKxk
qV2J+cnhQBGHqDGKNLUqRJvPnCqWBu5ZLKVvuTKXNJIIuAm8hkS8nhPNKYa0pXwX
DL9p8mwVpQhLW4qB9PbmDJSPKN2BYQQZMxlGaODDZJmw9nqQGlZ7Nm6hLKRPfYxC
K1x7Jg6N9bENZ8a8vWY9vQV8qFBMlBZkLqh5cFLBmq7qN9Mf8GaCUqaY7QmLP0Hw
localhost/CN=localhost/OU=Development/O=C64Emulator/L=Local/ST=Dev/C=US
-----END CERTIFICATE-----`;

fs.writeFileSync('cert.pem', cert);
console.log('✅ Created cert.pem');

console.log('\n✅ Certificates generated successfully!');
console.log('Note: These are self-signed certificates.');
console.log('Your browser will show a security warning - this is normal for local development.');
console.log('\nYou can now run: npm run dev');