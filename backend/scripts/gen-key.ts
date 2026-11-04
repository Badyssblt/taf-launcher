// Genere une cle de signature Ed25519 pour SIGNING_KEY (valeur en base64 sur une ligne).
import { generateKeyPairSync } from 'node:crypto';

const { privateKey } = generateKeyPairSync('ed25519');
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
console.log(Buffer.from(pem).toString('base64'));
