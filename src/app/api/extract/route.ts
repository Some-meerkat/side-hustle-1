import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import * as pdfParse from "pdf-parse";
import * as XLSX from "xlsx";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const name = file.name.toLowerCase();
    let text = "";

    if (name.endsWith(".pdf")) {
      const pdf = (pdfParse as unknown as { default: (buf: Buffer) => Promise<{ text: string }> }).default || pdfParse;
      const data = await pdf(buffer);
      text = data.text;
    } else if (name.endsWith(".docx") || name.endsWith(".doc")) {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const lines: string[] = [];
      for (const sheetName of workbook.SheetNames) {
        lines.push(`## Sheet: ${sheetName}`);
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        lines.push(csv);
      }
      text = lines.join("\n\n");
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload a PDF, Word, or Excel document." },
        { status: 400 }
      );
    }

    if (!text || text.trim().length < 20) {
      return NextResponse.json(
        { error: "Could not extract meaningful text from this file" },
        { status: 400 }
      );
    }

    // Truncate to ~100k chars
    const truncated = text.trim().slice(0, 100000);

    return NextResponse.json({ text: truncated });
  } catch (error) {
    console.error("File extraction error:", error);
    return NextResponse.json(
      { error: "Failed to extract text from file" },
      { status: 500 }
    );
  }
}
