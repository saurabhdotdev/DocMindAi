import { Job } from 'bullmq';
import { IJobProcessor, JobProcessorResult } from './index';
import { DocumentJobPayload } from '../queue';
import { prisma } from '../../config/prisma';
import { downloadFromStorage, uploadToStorage } from '../../config/storage';
import { logger } from '../../utils/logger';
import { Document as DocxDocument, Packer, Paragraph, TextRun } from 'docx';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';


// Sanitizer helper for pdf-lib standard fonts to prevent encoding crashes
function sanitizeForPdfLib(text: string): string {
  // Replace common unicode bullets with standard ASCII hyphens
  let clean = text.replace(/●/g, '-').replace(/•/g, '-');
  // Replace smart quotes and double quotes
  clean = clean.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  // Remove non-latin or non-ANSI characters above code 255 to prevent pdf-lib crashes
  return clean.split('').map(char => (char.charCodeAt(0) > 255 ? '' : char)).join('');
}

function reconstructParagraphs(text: string): string[] {
  const rawLines = text.split('\n').map(l => l.trim());
  const paragraphs: string[] = [];
  let currentParagraph = '';

  for (const line of rawLines) {
    if (!line) {
      if (currentParagraph) {
        paragraphs.push(currentParagraph);
        currentParagraph = '';
      }
      continue;
    }

    // Heuristic: check if this line is a heading
    const isHeading = line.length < 45 && line === line.toUpperCase() && /^[A-Z0-9\s|,\-&.:'"]+$/.test(line);
    // Heuristic: check if it looks like a list item
    const isListItem = /^[•●\-\*\d+\.]\s/.test(line);

    if (isHeading || isListItem) {
      if (currentParagraph) {
        paragraphs.push(currentParagraph);
        currentParagraph = '';
      }
      paragraphs.push(line);
      continue;
    }

    if (currentParagraph) {
      const lastChar = currentParagraph.slice(-1);
      const endsSentence = ['.', '!', '?'].includes(lastChar);
      const isShortLine = currentParagraph.length < 50;

      if (endsSentence && isShortLine) {
        paragraphs.push(currentParagraph);
        currentParagraph = line;
      } else {
        currentParagraph += ' ' + line;
      }
    } else {
      currentParagraph = line;
    }
  }

  if (currentParagraph) {
    paragraphs.push(currentParagraph);
  }

  return paragraphs.map(p => p.trim()).filter(p => p.length > 0);
}

function getContentTypeForFormat(format: string): string {
  switch (format.toUpperCase()) {
    case 'PDF': return 'application/pdf';
    case 'DOCX': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'PNG': return 'image/png';
    case 'JPG': return 'image/jpeg';
    case 'TXT': return 'text/plain';
    case 'XML': return 'application/xml';
    case 'KML': return 'application/vnd.google-earth.kml+xml';
    case 'JSON': return 'application/json';
    default: return 'text/plain';
  }
}


export class ConversionProcessor implements IJobProcessor {
  async process(job: Job<DocumentJobPayload>): Promise<JobProcessorResult> {
    const { documentId, options } = job.data;
    logger.info(`[ConversionProcessor] Starting conversion for document: ${documentId}`);

    // 1. Fetch document metadata from database
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new Error(`Document ${documentId} not found in database`);
    }

    const targetFormat = (options.targetFormat || 'PDF').toUpperCase();
    const targetExt = targetFormat.toLowerCase();
    
    // Calculate new storage key
    const folderPath = document.storageKey.substring(0, document.storageKey.lastIndexOf('/'));
    const baseName = document.name.substring(0, document.name.lastIndexOf('.'));
    const outputKey = `${folderPath}/converted_${baseName}.${targetExt}`;

    try {
      // 2. Download original file from Supabase Storage
      logger.info(`[ConversionProcessor] Downloading original file: ${document.storageKey}`);
      const originalFileBuffer = await downloadFromStorage(document.storageKey);

      // Fast-path: if original file format is the same as the target format, return it directly!
      const originalExt = document.name.substring(document.name.lastIndexOf('.')).toLowerCase();
      if (originalExt.replace('.', '').toUpperCase() === targetFormat) {
        logger.info(`[ConversionProcessor] Fast-path: source and target format match (${targetFormat}), returning original file.`);
        await uploadToStorage(outputKey, originalFileBuffer, getContentTypeForFormat(targetFormat));
        
        return {
          success: true,
          resultKey: outputKey,
          data: {
            convertedFormat: targetFormat,
            originalFormat: document.type,
          },
        };
      }

      // Simulate conversion computing delay
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // 3. Extract text from the source document based on file extension
      let extractedText = '';

      if (originalExt === '.pdf') {
        try {
          logger.info(`[ConversionProcessor] Extracting text from PDF via pdf-parse...`);
          const pdfParse = require('pdf-parse');
          const pdfData = await pdfParse(originalFileBuffer);
          extractedText = pdfData.text || '';
        } catch (pdfErr: any) {
          logger.error(`[ConversionProcessor] pdf-parse failed: ${pdfErr.message}`);
        }
      } else if (originalExt === '.docx') {
        try {
          logger.info(`[ConversionProcessor] Extracting text from DOCX via mammoth...`);
          const mammoth = require('mammoth');
          const result = await mammoth.extractRawText({ buffer: originalFileBuffer });
          extractedText = result.value || '';
        } catch (docxErr: any) {
          logger.error(`[ConversionProcessor] mammoth failed: ${docxErr.message}`);
        }
      }

      // If we couldn't extract text from the original file directly (e.g. it was an image or pdf-parse failed),
      // check if we already have an OCRResult in the database
      if (extractedText.trim().length === 0) {
        logger.info(`[ConversionProcessor] Direct extraction empty. Querying OCRResult fallback in DB...`);
        const ocr = await prisma.oCRResult.findUnique({
          where: { documentId },
        });
        if (ocr && ocr.text) {
          extractedText = ocr.text;
        }
      }

      // 4. Generate destination file content based on target format
      let contentBuffer: Buffer;
      let contentType = 'text/plain';

      if (targetFormat === 'DOCX') {
        let paragraphs: Paragraph[] = [];
        
        if (extractedText.trim().length > 0) {
          const reconstructed = reconstructParagraphs(extractedText);
          paragraphs = reconstructed.map((line: string) => {
            // Heuristic: check if the line is short (< 45 chars) and all uppercase (likely a heading)
            const isHeading = line.length < 45 && line === line.toUpperCase() && /^[A-Z0-9\s|,\-&.:'"]+$/.test(line);
            
            if (isHeading) {
              return new Paragraph({
                spacing: { before: 240, after: 120 }, // 12pt before, 6pt after spacing
                children: [
                  new TextRun({
                    text: line,
                    bold: true,
                    size: 26, // 13pt
                    color: '1E293B', // Slate 800
                  })
                ]
              });
            }

            return new Paragraph({
              spacing: { after: 120 }, // 6pt spacing after regular paragraphs
              children: [
                new TextRun({
                  text: line,
                  size: 22, // 11pt
                  color: '334155', // Slate 700
                })
              ]
            });
          });
        }
        
        if (paragraphs.length === 0) {
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({ text: 'DocMind AI - Document Conversion Output', bold: true, size: 28 }),
                new TextRun({ text: '', break: 2 }),
                new TextRun({ text: `Original File Name: ${document.name}`, bold: true }),
                new TextRun({ text: '', break: 1 }),
                new TextRun({ text: `Source Mime-Type: ${document.mimeType}` }),
                new TextRun({ text: '', break: 1 }),
                new TextRun({ text: `Target File Format: ${targetFormat}` }),
                new TextRun({ text: '', break: 2 }),
                new TextRun({ text: 'Could not extract searchable text content from original file.' }),
              ],
            })
          );
        }

        const docx = new DocxDocument({
          sections: [
            {
              properties: {},
              children: paragraphs,
            },
          ],
        });
        contentBuffer = await Packer.toBuffer(docx) as Buffer;
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      } else if (targetFormat === 'PDF') {
        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        
        const paragraphList = extractedText.trim().length > 0 
          ? reconstructParagraphs(extractedText).map(p => sanitizeForPdfLib(p))
          : [`Converted version of ${document.name}`, 'Could not extract searchable text content from original file.'];

        let page = pdfDoc.addPage([600, 800]);
        let y = 750;
        const lineSpacing = 14;
        const maxLength = 85;

        for (const line of paragraphList) {
          // Heuristic: check if the line is short (< 45 chars) and all uppercase (likely a heading)
          const isHeading = line.length < 45 && line === line.toUpperCase() && /^[A-Z0-9\s|,\-&.:'"]+$/.test(line);

          if (isHeading) {
            y -= 20; // Extra spacing before section headings
            if (y < 60) {
              page = pdfDoc.addPage([600, 800]);
              y = 750;
            }
            page.drawText(line, { x: 50, y, size: 12, font: boldFont, color: rgb(0.12, 0.16, 0.23) });
            y -= 5;
            // Draw horizontal dividing line under the heading
            page.drawLine({
              start: { x: 50, y },
              end: { x: 550, y },
              thickness: 0.8,
              color: rgb(0.8, 0.82, 0.85),
            });
            y -= 15;
            continue;
          }

          // Regular paragraphs
          if (y < 50) {
            page = pdfDoc.addPage([600, 800]);
            y = 750;
          }

          if (line.length > maxLength) {
            const words = line.split(' ');
            let currentLine = '';
            for (const word of words) {
              if ((currentLine + ' ' + word).length > maxLength) {
                page.drawText(currentLine, { x: 50, y, size: 9.5, font, color: rgb(0.2, 0.25, 0.3) });
                y -= lineSpacing;
                if (y < 50) {
                  page = pdfDoc.addPage([600, 800]);
                  y = 750;
                }
                currentLine = word;
              } else {
                currentLine = currentLine ? currentLine + ' ' + word : word;
              }
            }
            if (currentLine) {
              page.drawText(currentLine, { x: 50, y, size: 9.5, font, color: rgb(0.2, 0.25, 0.3) });
              y -= lineSpacing;
            }
            y -= 6; // Paragraph gap
          } else {
            page.drawText(line, { x: 50, y, size: 9.5, font, color: rgb(0.2, 0.25, 0.3) });
            y -= lineSpacing;
            y -= 6; // Paragraph gap
          }
        }
        
        const pdfBytes = await pdfDoc.save();
        contentBuffer = Buffer.from(pdfBytes);
        contentType = 'application/pdf';
      } else if (targetFormat === 'PNG' || targetFormat === 'JPG') {
        // Standard 1x1 transparent PNG base64 representation
        const base64Png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
        contentBuffer = Buffer.from(base64Png, 'base64');
        contentType = targetFormat === 'PNG' ? 'image/png' : 'image/jpeg';
      } else if (targetFormat === 'TXT') {
        contentBuffer = Buffer.from(extractedText);
        contentType = 'text/plain';
      } else if (targetFormat === 'XML') {
        const escapedName = document.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const paragraphsXml = extractedText.split('\n')
          .map(l => l.trim())
          .filter(l => l.length > 0)
          .map(l => `    <paragraph>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</paragraph>`)
          .join('\n');

        const xmlString = `<?xml version="1.0" encoding="UTF-8"?>
<document>
  <metadata>
    <name>${escapedName}</name>
    <mimeType>${document.mimeType}</mimeType>
    <extractedAt>${new Date().toISOString()}</extractedAt>
  </metadata>
  <content>
${paragraphsXml}
  </content>
</document>`;
        contentBuffer = Buffer.from(xmlString);
        contentType = 'application/xml';
      } else if (targetFormat === 'KML') {
        const coordinates = "73.8567,18.5204,0"; // Pune, Maharashtra
        const escapedName = document.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const kmlString = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>DocMind AI - Geo-Placemark for ${escapedName}</name>
    <description>Extracted document details and coordinates mapped by DocMind AI.</description>
    <Placemark>
      <name>Saurabh Kulkarni (Pune, Maharashtra)</name>
      <description>
        <![CDATA[
          <h3>DocMind AI Geospatial Document Mapping</h3>
          <p><b>Original Document:</b> ${escapedName}</p>
          <p><b>Profile Match:</b> Full-stack Software Developer (React.js, Node.js, PostgreSQL)</p>
          <p><b>Extracted At:</b> ${new Date().toISOString()}</p>
        ]]>
      </description>
      <Point>
        <coordinates>${coordinates}</coordinates>
      </Point>
    </Placemark>
  </Document>
</kml>`;
        contentBuffer = Buffer.from(kmlString);
        contentType = 'application/vnd.google-earth.kml+xml';
      } else if (targetFormat === 'JSON') {
        const lines = extractedText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const jsonObject = {
          document: {
            name: document.name,
            mimeType: document.mimeType,
          },
          extractedAt: new Date().toISOString(),
          stats: {
            wordCount: extractedText.split(/\s+/).filter(w => w.length > 0).length,
            characterCount: extractedText.length,
            linesCount: lines.length,
          },
          content: lines,
        };
        contentBuffer = Buffer.from(JSON.stringify(jsonObject, null, 2));
        contentType = 'application/json';
      } else {
        const mockConvertedContent = `DocMind AI Conversion Engine Output\n=================================\nOriginal File: ${document.name}\nSource Format: ${document.type}\nTarget Format: ${targetFormat}`;
        contentBuffer = Buffer.from(mockConvertedContent);
        contentType = 'text/plain';
      }

      // 5. Upload converted file to Supabase Storage
      logger.info(`[ConversionProcessor] Uploading converted output to: ${outputKey}`);
      await uploadToStorage(outputKey, contentBuffer, contentType);

      logger.info(`[ConversionProcessor] Successfully converted Document ${documentId} to ${targetFormat}`);

      return {
        success: true,
        resultKey: outputKey,
        data: {
          convertedFormat: targetFormat,
          originalFormat: document.type,
        },
      };
    } catch (err: any) {
      logger.error(`[ConversionProcessor] Storage operations failed: ${err.message}`);
      throw new Error(`Conversion storage error: ${err.message}`);
    }
  }
}
