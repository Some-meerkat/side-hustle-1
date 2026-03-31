import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; AgentReadable/1.0; +https://agentreadable.com)",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL: ${response.status}` },
        { status: 400 }
      );
    }

    const html = await response.text();

    // Strip HTML tags and extract text content
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
      .replace(/<[^>]+>/g, "\n")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!text || text.length < 50) {
      return NextResponse.json(
        { error: "Could not extract meaningful content from this URL" },
        { status: 400 }
      );
    }

    // Truncate to ~100k chars to stay within API limits
    const truncated = text.slice(0, 100000);

    return NextResponse.json({ text: truncated });
  } catch (error) {
    console.error("URL fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch URL content" },
      { status: 500 }
    );
  }
}
