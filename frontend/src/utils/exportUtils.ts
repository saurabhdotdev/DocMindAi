/**
 * Utility functions for exporting chat threads to Markdown or PDF.
 */

interface ChatMessage {
  role: string;
  content: string;
  agentName?: string;
}

/** Export conversation logs to a Markdown file */
export function exportToMarkdown(sessionTitle: string, messages: ChatMessage[], docName: string) {
  if (!messages || messages.length === 0) return;

  const dateStr = new Date().toLocaleDateString();
  let markdown = `# DocMind AI Chat Report\n`;
  markdown += `**Session**: ${sessionTitle}\n`;
  markdown += `**Source Document**: ${docName}\n`;
  markdown += `**Export Date**: ${dateStr}\n\n`;
  markdown += `---\n\n`;

  messages.forEach((msg) => {
    let sender = 'User';
    if (msg.role === 'assistant') sender = 'DocMind AI';
    else if (msg.role === 'leo') sender = 'Leo (Tech Lead)';
    else if (msg.role === 'sarah') sender = 'Sarah (HR Director)';
    else if (msg.role === 'mike') sender = 'Mike (Business Analyst)';
    else if (msg.role === 'custom_agent') sender = msg.agentName || 'Agent';

    markdown += `### 👤 ${sender}\n\n`;
    markdown += `${msg.content}\n\n`;
    markdown += `---\n\n`;
  });

  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  
  // Format file name
  const formattedTitle = sessionTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  link.setAttribute('download', `docmind_report_${formattedTitle}.md`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Export conversation logs to a styled PDF using a hidden print iframe */
export function exportToPDF(sessionTitle: string, messages: ChatMessage[], docName: string) {
  if (!messages || messages.length === 0) return;

  const dateStr = new Date().toLocaleDateString();

  // Build report HTML
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>DocMind Chat Report</title>
      <meta charset="utf-8">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #1f2937;
          line-height: 1.6;
          padding: 40px;
          max-width: 800px;
          margin: 0 auto;
          background-color: #ffffff;
        }

        /* Print formatting */
        @media print {
          body {
            padding: 0;
            max-width: 100%;
          }
          .no-print {
            display: none;
          }
          .page-break {
            page-break-after: always;
          }
        }

        header {
          border-bottom: 2px solid #f3f4f6;
          padding-bottom: 20px;
          margin-bottom: 30px;
        }

        .logo-container {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 15px;
        }

        .logo-dot {
          width: 12px;
          height: 12px;
          background-color: #6366f1;
          border-radius: 4px;
        }

        .logo-text {
          font-size: 18px;
          font-weight: 800;
          letter-spacing: -0.025em;
          color: #111827;
        }

        h1 {
          font-size: 24px;
          font-weight: 700;
          color: #111827;
          margin: 0 0 10px 0;
        }

        .metadata-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          font-size: 12px;
          color: #6b7280;
        }

        .metadata-label {
          font-weight: 600;
          color: #374151;
        }

        .message-container {
          margin-bottom: 25px;
          page-break-inside: avoid;
        }

        .user-header {
          font-size: 13px;
          font-weight: 700;
          color: #4f46e5;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .assistant-header {
          font-size: 13px;
          font-weight: 700;
          color: #0d9488;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .message-body {
          font-size: 14px;
          color: #1f2937;
          background-color: #f9fafb;
          border-radius: 12px;
          padding: 16px 20px;
          border: 1px solid #f3f4f6;
          white-space: pre-wrap;
        }

        .message-body.user {
          background-color: #f5f3ff;
          border-color: #ede9fe;
        }

        code {
          font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
          font-size: 12px;
          background-color: rgba(0, 0, 0, 0.05);
          padding: 2px 4px;
          border-radius: 4px;
        }

        pre {
          background-color: #1e293b;
          color: #f8fafc;
          padding: 15px;
          border-radius: 8px;
          font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
          font-size: 12px;
          overflow-x: auto;
          margin: 10px 0;
        }

        footer {
          margin-top: 50px;
          border-top: 1px solid #f3f4f6;
          padding-top: 15px;
          font-size: 11px;
          color: #9ca3af;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <header>
        <div class="logo-container">
          <div class="logo-dot"></div>
          <span class="logo-text">DocMind AI</span>
        </div>
        <h1>Workspace Report</h1>
        <div class="metadata-grid">
          <div><span class="metadata-label">Report Topic:</span> ${sessionTitle}</div>
          <div><span class="metadata-label">Export Date:</span> ${dateStr}</div>
          <div><span class="metadata-label">Source Document:</span> ${docName}</div>
        </div>
      </header>

      <main>
  `;

  messages.forEach((msg) => {
    let sender = 'User';
    let isUser = msg.role === 'user';
    if (msg.role === 'assistant') sender = 'DocMind AI';
    else if (msg.role === 'leo') sender = 'Leo (Tech Lead)';
    else if (msg.role === 'sarah') sender = 'Sarah (HR Director)';
    else if (msg.role === 'mike') sender = 'Mike (Business Analyst)';
    else if (msg.role === 'custom_agent') sender = msg.agentName || 'Agent';

    html += `
      <div class="message-container">
        <div class="${isUser ? 'user-header' : 'assistant-header'}">
          ${isUser ? '👤' : '🤖'} ${sender}
        </div>
        <div class="message-body ${isUser ? 'user' : ''}">${formatHTMLContent(msg.content)}</div>
      </div>
    `;
  });

  html += `
      </main>
      <footer>
        Generated automatically by DocMind AI Workspace. All rights reserved.
      </footer>
    </body>
    </html>
  `;

  // Create temporary hidden iframe
  const iframe = document.createElement('iframe');
  iframe.style.position = 'absolute';
  iframe.style.width = '0px';
  iframe.style.height = '0px';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();

    // Trigger print/PDF rendering after content loads
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      // Remove iframe after short delay
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 500);
  }
}

/** Simple parser to render basic Markdown tags as HTML inside the PDF template */
function formatHTMLContent(text: string): string {
  if (!text) return '';
  
  // Escape HTML characters
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code Blocks
  escaped = escaped.replace(/```\w*\n([\s\S]*?)```/g, (_, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // Inline Code
  escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers
  escaped = escaped.replace(/^### (.*)$/gm, '<h3>$1</h3>');
  escaped = escaped.replace(/^## (.*)$/gm, '<h2>$1</h2>');
  escaped = escaped.replace(/^# (.*)$/gm, '<h1>$1</h1>');

  // Bold
  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italics
  escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  return escaped;
}
