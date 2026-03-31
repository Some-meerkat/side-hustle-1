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

    // Extract page metadata from HTML
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const ogTitleMatch = html.match(/property="og:title"\s+content="([^"]*)"/i);
    const ogDescMatch = html.match(/property="og:description"\s+content="([^"]*)"/i);
    const ogTypeMatch = html.match(/property="og:type"\s+content="([^"]*)"/i);
    const authorMatch = html.match(/name="author"\s+content="([^"]*)"/i);
    const dateMatch = html.match(/name="(?:date|publish[_-]?date|article:published_time)"\s+content="([^"]*)"/i)
      || html.match(/property="article:published_time"\s+content="([^"]*)"/i);

    const metadata = {
      title: ogTitleMatch?.[1] || titleMatch?.[1]?.trim() || "",
      description: ogDescMatch?.[1] || "",
      type: ogTypeMatch?.[1] || "",
      author: authorMatch?.[1] || "",
      date: dateMatch?.[1] || "",
      url,
    };

    // Structure-preserving extraction: convert HTML to lightweight markup
    let structured = html
      // Remove non-content elements
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
      .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      // Preserve heading hierarchy
      .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n[H1] $1\n")
      .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n[H2] $1\n")
      .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n[H3] $1\n")
      .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n[H4] $1\n")
      .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, "\n[H5] $1\n")
      .replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, "\n[H6] $1\n")
      // Preserve list structure
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n[LI] $1")
      .replace(/<ul[^>]*>/gi, "\n[LIST]")
      .replace(/<\/ul>/gi, "\n[/LIST]")
      .replace(/<ol[^>]*>/gi, "\n[ORDERED]")
      .replace(/<\/ol>/gi, "\n[/ORDERED]")
      // Preserve tables
      .replace(/<table[^>]*>/gi, "\n[TABLE]")
      .replace(/<\/table>/gi, "\n[/TABLE]")
      .replace(/<tr[^>]*>/gi, "\n[ROW]")
      .replace(/<\/tr>/gi, "")
      .replace(/<th[^>]*>([\s\S]*?)<\/th>/gi, " [TH]$1[/TH] ")
      .replace(/<td[^>]*>([\s\S]*?)<\/td>/gi, " [TD]$1[/TD] ")
      // Preserve emphasis
      .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**")
      .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**")
      .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "*$1*")
      .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, "*$1*")
      // Preserve blockquotes
      .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, "\n[QUOTE] $1 [/QUOTE]\n")
      // Preserve code blocks
      .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, "\n[CODE]\n$1\n[/CODE]\n")
      .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`")
      // Paragraphs and breaks
      .replace(/<p[^>]*>/gi, "\n\n")
      .replace(/<\/p>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<hr\s*\/?>/gi, "\n---\n")
      // Links — preserve href
      .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 [$1]")
      // Strip remaining tags
      .replace(/<[^>]+>/g, " ")
      // Decode entities
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&rsquo;/g, "'")
      .replace(/&lsquo;/g, "'")
      .replace(/&rdquo;/g, "\u201D")
      .replace(/&ldquo;/g, "\u201C")
      .replace(/&mdash;/g, "\u2014")
      .replace(/&ndash;/g, "\u2013")
      // Clean up whitespace
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!structured || structured.length < 50) {
      return NextResponse.json(
        { error: "Could not extract meaningful content from this URL" },
        { status: 400 }
      );
    }

    const truncated = structured.slice(0, 100000);

    return NextResponse.json({ text: truncated, metadata });
  } catch (error) {
    console.error("URL fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch URL content" },
      { status: 500 }
    );
  }
}
