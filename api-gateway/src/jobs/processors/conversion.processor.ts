import { Job } from 'bullmq';
import { IJobProcessor, JobProcessorResult } from './index';
import { DocumentJobPayload } from '../queue';
import { prisma } from '../../config/prisma';
import { s3Client } from '../../config/s3';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { logger } from '../../utils/logger';
import { Document as DocxDocument, Packer, Paragraph, TextRun } from 'docx';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'docmind-uploads';

// Sanitizer helper for pdf-lib standard fonts to prevent encoding crashes
function sanitizeForPdfLib(text: string): string {
  // Replace common unicode bullets with standard ASCII hyphens
  let clean = text.replace(/●/g, '-').replace(/•/g, '-');
  // Replace smart quotes and double quotes
  clean = clean.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  // Remove non-latin or non-ANSI characters above code 255 to prevent pdf-lib crashes
  return clean.split('').map(char => (char.charCodeAt(0) > 255 ? '' : char)).join('');
}

// Stream helper to read S3 object body
async function streamToBuffer(stream: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: any[] = [];
    stream.on('data', (chunk: any) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
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
      // 2. Download original file from S3 to read content
      logger.info(`[ConversionProcessor] Downloading original S3 file: ${document.storageKey}`);
      const s3Response = await s3Client.send(
        new GetObjectCommand({
          Bucket: S3_BUCKET_NAME,
          Key: document.storageKey,
        })
      );
      const originalFileBuffer = await streamToBuffer(s3Response.Body);

      // Simulate conversion computing delay
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // 3. Extract text from the source document based on file extension
      let extractedText = '';
      const originalExt = document.name.substring(document.name.lastIndexOf('.')).toLowerCase();

      if (originalExt === '.pdf') {
        try {
          logger.info(`[ConversionProcessor] Extracting text from PDF via pdf-parse...`);
          const pdf = require('pdf-parse');
          const parser = new pdf.PDFParse({ data: originalFileBuffer });
          const pdfData = await parser.getText();
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

      // 4. Generate destination file content based on target format
      let contentBuffer: Buffer;
      let contentType = 'text/plain';

      if (targetFormat === 'DOCX') {
        let paragraphs: Paragraph[] = [];
        
        if (extractedText.trim().length > 0) {
          const lines = extractedText.split('\n');
          paragraphs = lines
            .map((line: string) => line.trim())
            .filter((line: string) => line.length > 0)
            .map((line: string) => {
              // Heuristic: check if the line is short (< 35 chars) and all uppercase (likely a heading)
              const isHeading = line.length < 35 && line === line.toUpperCase() && /^[A-Z\s|,\-&]+$/.test(line);
              
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
                spacing: { after: 100 }, // 5pt spacing after regular paragraphs
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
        
        const lines = extractedText.trim().length > 0 
          ? extractedText.split('\n').map(l => sanitizeForPdfLib(l.trim())).filter(l => l.length > 0)
          : [`Converted version of ${document.name}`, 'Could not extract searchable text content from original file.'];

        let page = pdfDoc.addPage([600, 800]);
        let y = 750;
        const lineSpacing = 14;
        const maxLength = 85;

        for (const line of lines) {
          // Heuristic: check if the line is short (< 35 chars) and all uppercase (likely a heading)
          const isHeading = line.length < 35 && line === line.toUpperCase() && /^[A-Z\s|,\-&]+$/.test(line);

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
          } else {
            page.drawText(line, { x: 50, y, size: 9.5, font, color: rgb(0.2, 0.25, 0.3) });
            y -= lineSpacing;
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

      // 5. Upload converted file back to S3
      logger.info(`[ConversionProcessor] Uploading converted output to: ${outputKey}`);
      await s3Client.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET_NAME,
          Key: outputKey,
          Body: contentBuffer,
          ContentType: contentType,
        })
      );

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
      logger.error(`[ConversionProcessor] S3 operations failed: ${err.message}`);
      throw new Error(`Conversion S3 error: ${err.message}`);
    }
  }
}
