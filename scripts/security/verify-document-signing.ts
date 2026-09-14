import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";

import forge from "node-forge";
import { PDFDocument } from "pdf-lib";

const TEST_P12_PASSPHRASE = "test-only-passphrase";
const ONE_PIXEL_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL4WQAAAABJRU5ErkJggg==";

function createTestCertificate(): Buffer {
  const keyPair = forge.pki.rsa.generateKeyPair(1024);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keyPair.publicKey;
  certificate.serialNumber = "01";
  certificate.validity.notBefore = new Date(Date.now() - 60_000);
  certificate.validity.notAfter = new Date(Date.now() + 60_000);
  const attributes = [{ name: "commonName", value: "SolarDream test certificate" }];
  certificate.setSubject(attributes);
  certificate.setIssuer(attributes);
  certificate.sign(keyPair.privateKey, forge.md.sha256.create());

  const pkcs12 = forge.pkcs12.toPkcs12Asn1(
    keyPair.privateKey,
    [certificate],
    TEST_P12_PASSPHRASE,
  );
  return Buffer.from(forge.asn1.toDer(pkcs12).getBytes(), "binary");
}

async function main(): Promise<void> {
  const tempDirectory = await mkdtemp(path.join(tmpdir(), "solardream-document-signing-"));
  const certificatePath = path.join(tempDirectory, "test-certificate.p12");
  const originalCertificatePath = process.env.PDF_SIGNING_P12_PATH;
  const originalPassphrase = process.env.PDF_SIGNING_P12_PASSPHRASE;

  try {
    await writeFile(certificatePath, createTestCertificate());
    process.env.PDF_SIGNING_P12_PATH = certificatePath;
    process.env.PDF_SIGNING_P12_PASSPHRASE = TEST_P12_PASSPHRASE;

    const pdf = await PDFDocument.create();
    pdf.addPage([612, 792]);
    const { stampAndCryptographicallySignPdf } = await import("@/lib/document-signing/signPdf");
    const signedPdf = await stampAndCryptographicallySignPdf(
      Buffer.from(await pdf.save()),
      {
        fileId: "test-drive-file-id",
        signatureBase64: ONE_PIXEL_PNG,
        pageNumber: 1,
        x: 0.15,
        y: 0.7,
        width: 0.3,
        height: 0.15,
      },
    );

    if (signedPdf.subarray(0, 4).toString("ascii") !== "%PDF") {
      throw new Error("The signer did not return a PDF.");
    }
    if (!signedPdf.includes(Buffer.from("/ByteRange", "ascii"))) {
      throw new Error("The signed PDF is missing a cryptographic byte range.");
    }

    const { verifySignedPdf } = await import("@/lib/document-signing/verifyPdf");
    const verification = verifySignedPdf(signedPdf);
    if (!verification.integrity) {
      throw new Error("The verifier did not recognize the signed PDF's intact byte range.");
    }
    if (verification.authenticity || verification.verified) {
      throw new Error("The temporary self-signed certificate must not be reported as system-trusted.");
    }

    const tamperedPdf = Buffer.from(signedPdf);
    const solarDreamMarker = tamperedPdf.indexOf(Buffer.from("SolarDream", "ascii"));
    if (solarDreamMarker < 0) throw new Error("The signed test PDF is missing its signature metadata.");
    tamperedPdf[solarDreamMarker] = 0x58;
    if (verifySignedPdf(tamperedPdf).integrity) {
      throw new Error("The verifier did not detect a modification to signed PDF data.");
    }

    console.log("Document-signing verification passed: visual stamp, PKCS#12 signature, and tamper detection.");
  } finally {
    if (originalCertificatePath === undefined) delete process.env.PDF_SIGNING_P12_PATH;
    else process.env.PDF_SIGNING_P12_PATH = originalCertificatePath;
    if (originalPassphrase === undefined) delete process.env.PDF_SIGNING_P12_PASSPHRASE;
    else process.env.PDF_SIGNING_P12_PASSPHRASE = originalPassphrase;
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
