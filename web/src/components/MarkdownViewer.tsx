import React from "react";
import { Info, AlertTriangle, FileText } from "lucide-react";

interface MarkdownViewerProps {
  content: string;
  className?: string;
}

export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({ content, className = "" }) => {
  if (!content) {
    return (
      <div className="p-6 text-center text-muted font-mono text-sm">
        No markdown content provided.
      </div>
    );
  }

  // Parse lines into structured blocks
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;

  const renderInline = (text: string): React.ReactNode => {
    // Process markdown links [text](url)
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let keyIdx = 0;

    // Regex for inline code `...`, bold **...**, links [text](url)
    const tokenRegex = /(\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(remaining)) !== null) {
      if (match.index > lastIndex) {
        parts.push(remaining.substring(lastIndex, match.index));
      }

      if (match[2] && match[3]) {
        // Link [text](url)
        const linkText = match[2];
        const url = match[3];
        parts.push(
          <a
            key={`link-${keyIdx++}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-info underline hover:text-text transition-colors"
          >
            {linkText}
          </a>
        );
      } else if (match[4]) {
        // Code `...`
        parts.push(
          <code
            key={`code-${keyIdx++}`}
            className="px-1.5 py-0.5 text-xs font-mono bg-surface-sunken text-info rounded border border-border"
          >
            {match[4]}
          </code>
        );
      } else if (match[5]) {
        // Bold **...**
        parts.push(
          <strong key={`bold-${keyIdx++}`} className="font-semibold text-text">
            {match[5]}
          </strong>
        );
      }
      lastIndex = tokenRegex.lastIndex;
    }

    if (lastIndex < remaining.length) {
      parts.push(remaining.substring(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      i++;
      continue;
    }

    // Horizontal Rule
    if (line === "---" || line === "***" || line === "___") {
      blocks.push(<hr key={`hr-${i}`} className="border-border my-6" />);
      i++;
      continue;
    }

    // Headings
    if (line.startsWith("# ")) {
      blocks.push(
        <h1
          key={`h1-${i}`}
          className="text-xl sm:text-2xl font-bold tracking-tight text-text mt-6 mb-3 flex items-center gap-2 border-b border-border pb-2"
        >
          <FileText className="w-5 h-5 text-verified flex-shrink-0" aria-hidden="true" />
          <span>{renderInline(line.substring(2))}</span>
        </h1>
      );
      i++;
      continue;
    }

    if (line.startsWith("## ")) {
      blocks.push(
        <h2
          key={`h2-${i}`}
          className="text-lg sm:text-xl font-bold text-text mt-6 mb-3 flex items-center gap-2 text-verified"
        >
          <span>{renderInline(line.substring(3))}</span>
        </h2>
      );
      i++;
      continue;
    }

    if (line.startsWith("### ")) {
      blocks.push(
        <h3
          key={`h3-${i}`}
          className="text-base sm:text-lg font-semibold text-text mt-4 mb-2 text-info"
        >
          {renderInline(line.substring(4))}
        </h3>
      );
      i++;
      continue;
    }

    // Blockquote / Alert
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("> ")) {
        quoteLines.push(lines[i].trim().substring(2));
        i++;
      }
      const quoteText = quoteLines.join(" ");
      const isWarning =
        quoteText.toLowerCase().includes("prominent") ||
        quoteText.toLowerCase().includes("warning") ||
        quoteText.toLowerCase().includes("limitation");

      blocks.push(
        <div
          key={`quote-${i}`}
          className={`my-4 p-4 rounded-xl border flex gap-3 ${
            isWarning
              ? "bg-warning/10 border-warning/40 text-text"
              : "bg-surface-raised border-border text-muted"
          }`}
        >
          {isWarning ? (
            <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" aria-hidden="true" />
          ) : (
            <Info className="w-5 h-5 text-info flex-shrink-0 mt-0.5" aria-hidden="true" />
          )}
          <div className="text-sm leading-relaxed">{renderInline(quoteText)}</div>
        </div>
      );
      continue;
    }

    // Table
    if (line.startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        const headerRow = tableLines[0]
          .split("|")
          .slice(1, -1)
          .map((c) => c.trim());
        // tableLines[1] is alignment separator e.g. |---|---:|
        const dataRows = tableLines.slice(2).map((r) =>
          r
            .split("|")
            .slice(1, -1)
            .map((c) => c.trim())
        );

        blocks.push(
          <div
            key={`table-${i}`}
            className="my-4 overflow-x-auto rounded-xl border border-border bg-surface-card shadow-sm"
          >
            <table className="w-full text-left text-xs sm:text-sm border-collapse">
              <thead>
                <tr className="bg-surface-raised border-b border-border text-muted uppercase text-[11px] tracking-wider font-mono">
                  {headerRow.map((cell, cIdx) => (
                    <th key={`th-${cIdx}`} className="px-3.5 py-2.5 font-semibold">
                      {renderInline(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 font-mono">
                {dataRows.map((row, rIdx) => (
                  <tr
                    key={`tr-${rIdx}`}
                    className={`hover:bg-surface-raised/40 transition-colors ${
                      rIdx % 2 === 0 ? "bg-surface/30" : "bg-transparent"
                    }`}
                  >
                    {row.map((cell, cIdx) => (
                      <td key={`td-${rIdx}-${cIdx}`} className="px-3.5 py-2.5 text-text">
                        {renderInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // Unordered List
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const listItems: string[] = [];
      while (
        i < lines.length &&
        (lines[i].trim().startsWith("- ") || lines[i].trim().startsWith("* "))
      ) {
        listItems.push(lines[i].trim().substring(2));
        i++;
      }
      blocks.push(
        <ul key={`ul-${i}`} className="my-2 space-y-1.5 list-disc list-inside text-sm text-muted">
          {listItems.map((item, lIdx) => (
            <li key={`li-${lIdx}`} className="leading-relaxed">
              <span className="text-text">{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered List
    const orderedMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (orderedMatch) {
      const listItems: { num: string; text: string }[] = [];
      while (i < lines.length) {
        const m = lines[i].trim().match(/^(\d+)\.\s+(.*)$/);
        if (!m) break;
        listItems.push({ num: m[1], text: m[2] });
        i++;
      }
      blocks.push(
        <ol key={`ol-${i}`} className="my-3 space-y-2 text-sm text-muted">
          {listItems.map((item, lIdx) => (
            <li key={`oli-${lIdx}`} className="flex gap-2 leading-relaxed">
              <span className="font-mono text-info font-bold flex-shrink-0">{item.num}.</span>
              <span className="text-text">{renderInline(item.text)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Normal Paragraph
    blocks.push(
      <p key={`p-${i}`} className="text-sm leading-relaxed text-muted my-2">
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return <div className={`space-y-2 text-text ${className}`}>{blocks}</div>;
};
