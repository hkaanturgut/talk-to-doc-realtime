// Generates the PDF fixtures used by unit, integration and e2e tests. Output: tests/fixtures/out/.
// Fixtures are generated (not committed) so there are no binary blobs of unknown origin in the repo.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts } from "pdf-lib";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "out");

export const SENTENCES = [
  "The capital of Atlantis is Poseidonia, a city of nine harbors.",
  "Atlantean engineers built the Great Tide Wall in the year 412.",
  "The national dish of Atlantis is kelp bread with smoked eel.",
];

async function textPdf(pageCount: number, linesPerPage: (page: number) => string[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Fixture");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let p = 0; p < pageCount; p++) {
    const page = pdf.addPage([612, 792]);
    let y = 740;
    for (const line of linesPerPage(p)) {
      page.drawText(line, { x: 50, y, size: 11, font });
      y -= 16;
    }
  }
  return pdf.save();
}

async function scannedPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (let p = 0; p < 2; p++) {
    const page = pdf.addPage([612, 792]);
    for (let i = 0; i < 30; i++) page.drawRectangle({ x: 40, y: 60 + i * 22, width: 500, height: 10 });
  }
  return pdf.save();
}

/**
 * Minimal PDF with a Standard security handler whose /U entry does not match the empty password,
 * so PDF.js asks for a password (PasswordException). pdf-lib cannot encrypt, so this is built by hand.
 */
function encryptedPdf(): Uint8Array {
  const hex32 = (seed: number) =>
    Array.from({ length: 32 }, (_, i) => ((i * 37 + seed) % 256).toString(16).padStart(2, "0")).join("");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>",
    "<< /Length 0 >>\nstream\n\nendstream",
    `<< /Filter /Standard /V 1 /R 2 /O <${hex32(7)}> /U <${hex32(91)}> /P -44 >>`,
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefAt = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, "0")} 00000 n \n`;
  body +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Encrypt 5 0 R ` +
    `/ID [<${hex32(3).slice(0, 32)}> <${hex32(3).slice(0, 32)}>] >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

export async function makeFixtures(): Promise<string> {
  mkdirSync(outDir, { recursive: true });
  const text = await textPdf(3, (p) => [
    `Page ${p + 1} of the Atlantis fact sheet.`,
    SENTENCES[p] ?? "",
    "End of page.",
  ]);
  writeFileSync(join(outDir, "text.pdf"), text);
  writeFileSync(
    join(outDir, "long.pdf"),
    await textPdf(300, (p) =>
      Array.from(
        { length: 40 },
        (_, l) => `Page ${p + 1} line ${l + 1}: Atlantis history continues with more detail.`,
      ),
    ),
  );
  writeFileSync(join(outDir, "scanned.pdf"), await scannedPdf());
  writeFileSync(join(outDir, "encrypted.pdf"), encryptedPdf());
  writeFileSync(join(outDir, "corrupt.pdf"), text.slice(0, Math.floor(text.length * 0.3)));
  writeFileSync(join(outDir, "not-pdf.pdf"), "This is a plain text file renamed to .pdf\n".repeat(20));
  return outDir;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  makeFixtures().then((dir) => console.log(`fixtures written to ${dir}`));
}
