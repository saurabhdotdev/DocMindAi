import React from 'react';

interface MarkdownRendererProps {
  content: string;
  onCitationClick?: (index: number) => void;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, onCitationClick }) => {
  if (!content) return null;

  // Split by triple backticks to identify code blocks
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2 text-brand-text">
      {parts.map((part, index) => {
        if (part.startsWith('```')) {
          // It's a code block
          const match = part.match(/```(\w*)\n([\s\S]*?)```/);
          const lang = match ? match[1] : '';
          const code = match ? match[2] : part.slice(3, -3);

          return (
            <pre
              key={index}
              className="bg-brand-dark/60 border border-white/5 rounded-xl p-3 my-2.5 font-mono text-[11px] text-brand-primary/90 overflow-x-auto select-all max-w-full"
            >
              {lang && (
                <div className="text-[9px] uppercase tracking-wider text-brand-textMuted mb-1.5 border-b border-white/5 pb-1 font-sans">
                  {lang}
                </div>
              )}
              <code>{code.trim()}</code>
            </pre>
          );
        }

        // It's a normal text block, handle headers, lists, tables, and inline formatting line-by-line
        const lines = part.split('\n');
        const elements: React.ReactNode[] = [];
        let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;
        let currentTable: string[][] | null = null;

        const flushList = (key: number) => {
          if (!currentList) return null;
          const listKey = `list-${key}`;
          const listItems = currentList.items.map((item, idx) => (
            <li key={idx} className="mb-1 last:mb-0">
              {renderInlineFormatting(item, onCitationClick)}
            </li>
          ));
          const list = currentList.type === 'ul' ? (
            <ul key={listKey} className="list-disc pl-5 mb-2.5 text-brand-text">
              {listItems}
            </ul>
          ) : (
            <ol key={listKey} className="list-decimal pl-5 mb-2.5 text-brand-text">
              {listItems}
            </ol>
          );
          currentList = null;
          return list;
        };

        const flushTable = (key: number) => {
          if (!currentTable || currentTable.length === 0) return null;
          const tableKey = `table-${key}`;
          
          // The first row is the header
          const headers = currentTable[0];
          const rows = currentTable.slice(1);

          const table = (
            <div key={tableKey} className="overflow-x-auto my-3.5 border border-white/10 rounded-xl bg-brand-dark/40 max-w-full shadow-lg">
              <table className="min-w-full divide-y divide-white/5 text-[11px]">
                <thead className="bg-white/5 backdrop-blur-sm">
                  <tr>
                    {headers.map((h, idx) => (
                      <th key={idx} className="px-4 py-2.5 text-left font-extrabold text-white uppercase tracking-wider text-[10px] border-b border-white/5">
                        {renderInlineFormatting(h, onCitationClick)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-white/[0.02] transition-colors odd:bg-white/[0.01]">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="px-4 py-2.5 text-brand-text break-words">
                          {renderInlineFormatting(cell, onCitationClick)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
          currentTable = null;
          return table;
        };

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // 1. Markdown Tables
          if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
            const cells = line.split('|').map(c => c.trim()).slice(1, -1);
            const isSeparator = cells.every(c => /^:?-+:?$/.test(c));
            
            if (isSeparator) {
              // Skip table delimiter lines, but ensure we keep going
              continue;
            }

            if (!currentTable) {
              if (currentList) elements.push(flushList(i));
              currentTable = [cells];
            } else {
              currentTable.push(cells);
            }
            continue;
          }

          // If we were building a table and current line is not table, flush it
          if (currentTable) {
            elements.push(flushTable(i));
          }

          // 2. Unordered lists
          if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
            const cleanText = line.replace(/^\s*[-*]\s+/, '');
            if (!currentList || currentList.type !== 'ul') {
              if (currentList) {
                elements.push(flushList(i));
              }
              currentList = { type: 'ul', items: [cleanText] };
            } else {
              currentList.items.push(cleanText);
            }
            continue;
          }

          // 3. Ordered lists
          if (/^\s*\d+\.\s+/.test(line)) {
            const cleanText = line.replace(/^\s*\d+\.\s+/, '');
            if (!currentList || currentList.type !== 'ol') {
              if (currentList) {
                elements.push(flushList(i));
              }
              currentList = { type: 'ol', items: [cleanText] };
            } else {
              currentList.items.push(cleanText);
            }
            continue;
          }

          // If we were building a list and line is not a list item, flush it
          if (currentList) {
            elements.push(flushList(i));
          }

          // 4. Headers
          if (line.startsWith('### ')) {
            elements.push(
              <h3 key={i} className="text-xs font-bold text-white mt-3.5 mb-1.5 first:mt-0">
                {renderInlineFormatting(line.slice(4), onCitationClick)}
              </h3>
            );
            continue;
          }
          if (line.startsWith('## ')) {
            elements.push(
              <h2 key={i} className="text-sm font-bold text-white mt-4 mb-2 first:mt-0">
                {renderInlineFormatting(line.slice(3), onCitationClick)}
              </h2>
            );
            continue;
          }
          if (line.startsWith('# ')) {
            elements.push(
              <h1 key={i} className="text-base font-bold text-white mt-4.5 mb-2 first:mt-0">
                {renderInlineFormatting(line.slice(2), onCitationClick)}
              </h1>
            );
            continue;
          }

          // 5. Regular paragraph
          if (line.trim() !== '') {
            elements.push(
              <p key={i} className="mb-2 last:mb-0">
                {renderInlineFormatting(line, onCitationClick)}
              </p>
            );
          }
        }

        if (currentTable) {
          elements.push(flushTable(lines.length));
        }
        if (currentList) {
          elements.push(flushList(lines.length));
        }

        return <React.Fragment key={index}>{elements}</React.Fragment>;
      })}
    </div>
  );
};

// Render inline formatting (**bold**, *italics*, `code`, [citation])
function renderInlineFormatting(text: string, onCitationClick?: (index: number) => void): React.ReactNode[] {
  // Split by inline code blocks first
  const parts = text.split(/(`[^`]+`)/g);

  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={index}
          className="bg-white/5 border border-white/10 rounded px-1.5 py-0.5 font-mono text-[10px] text-brand-primary"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    // Process bold (**bold**), italics (*italics*), and citations ([1], [2], etc.)
    const boldItalicParts = part.split(/(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|\[\d+\])/g);

    return (
      <span key={index}>
        {boldItalicParts.map((subPart, subIndex) => {
          if (subPart.startsWith('***') && subPart.endsWith('***')) {
            return (
              <strong key={subIndex}>
                <em>{subPart.slice(3, -3)}</em>
              </strong>
            );
          }
          if (subPart.startsWith('**') && subPart.endsWith('**')) {
            return <strong key={subIndex} className="font-bold text-white">{subPart.slice(2, -2)}</strong>;
          }
          if (subPart.startsWith('*') && subPart.endsWith('*')) {
            return <em key={subIndex}>{subPart.slice(1, -1)}</em>;
          }
          if (/^\[\d+\]$/.test(subPart)) {
            const numStr = subPart.slice(1, -1);
            const num = parseInt(numStr, 10);
            return (
              <span
                key={subIndex}
                onClick={() => onCitationClick?.(num - 1)}
                className="inline-flex items-center justify-center font-bold text-[9px] text-brand-primary bg-brand-primary/10 border border-brand-primary/25 rounded-md w-4.5 h-4.5 mx-0.5 select-none hover:bg-brand-primary hover:text-white cursor-pointer transition-all align-super"
                title={`View Citation Source ${num}`}
              >
                {num}
              </span>
            );
          }
          return subPart;
        })}
      </span>
    );
  });
}
