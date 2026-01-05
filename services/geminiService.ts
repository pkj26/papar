import { GoogleGenAI, Type } from "@google/genai";
// @ts-ignore
import mammoth from 'mammoth';
// @ts-ignore
import * as pdfjsLibProxy from 'pdfjs-dist';

// Handle ESM/CJS default export inconsistency for pdfjs-dist
// @ts-ignore
const pdfjsLib = pdfjsLibProxy.default || pdfjsLibProxy;

// Configure PDF Worker - Use cdnjs for stable access to the worker script
if (pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

// --- CONFIGURATION ---
const BATCH_SIZE = 1; // Process 1 page at a time to ensure NO data is missing or truncated
const MAX_CONCURRENT_REQUESTS = 3; // Keep 3 parallel workers for speed

export interface ExtractionProgress {
    totalPages: number;
    processedPages: number;
    entriesFound: number;
    status: string;
}

const SYSTEM_PROMPT = `
You are an expert Frontend Engineer.
Task: Convert the provided image/PDF inputs into a SINGLE, seamless HTML string using Tailwind CSS.

**CRITICAL RULES:**
1. **COMPLETE CONVERSION**: You must convert **EVERY PAGE** and **EVERY QUESTION** in the input files. Do not skip any content.
2. **CONTINUOUS SCROLL**: Stitch all pages together into one continuous vertical layout. Remove page breaks.
3. **STYLING**: Use Tailwind CSS. Make it look like a clean, professional exam paper.
   - Use <div class="p-6 max-w-4xl mx-auto bg-white shadow-lg my-4"> for the main container.
4. **ACCURACY**: Extract text and tables exactly as they appear.
5. **IMAGES**: If there are diagrams, describe them in text [Diagram: description] if you cannot generate them, or use placeholder SVGs if simple.

**Output:**
- Return ONLY the HTML code.
- No markdown formatting.
- If the input is long, ensure you generate the FULL output.
`;

const REMIX_PROMPT = `
You are an expert Exam Setter.
Task: Rewrite the provided exam questions with different values but same logic.
Output: Valid HTML only.
`;

const SOLUTION_PROMPT = `
You are a Super-Intelligent Professor.
Task: Generate detailed, step-by-step solutions for **EVERY SINGLE QUESTION** identified in the provided HTML.

**STRICT PROCESS:**
1. **IDENTIFY**: Scan the HTML and identify Question 1, Question 2, Question 3, etc.
2. **SOLVE ALL**: You MUST generate a solution for **ALL** identified questions.
   - If there are 5 questions, I expect 5 solution blocks.
   - **DO NOT STOP** after Q1.
   - **DO NOT** write "Repeat for other questions".
3. **FORMATTING**:
   - Wrap each solution in: <div class="solution-item mb-8 p-6 border-b border-gray-200">
   - Title: <h3 class="text-xl font-bold text-blue-800 mb-4 bg-blue-50 inline-block px-3 py-1 rounded">Solution for Q[#]</h3>
   - Body: <div class="text-gray-800 text-lg leading-relaxed font-handwriting"> (Use a handwriting-like font family if available)

**Output:**
- Return ONLY the HTML string of the solutions.
- Ensure the output is complete.
`;

/**
 * Resizes and compresses an image file.
 */
const optimizeImage = (file: File): Promise<{ mimeType: string; data: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_DIM = 1536; 

        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const mimeType = 'image/jpeg';
        const quality = 0.7; 
        const dataUrl = canvas.toDataURL(mimeType, quality);
        const data = dataUrl.split(',')[1];
        
        resolve({ mimeType, data });
      };
      img.onerror = (err) => reject(new Error('Failed to load image for optimization'));
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const fileToGenerativePart = async (file: File): Promise<any> => {
  if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const arrayBuffer = e.target?.result as ArrayBuffer;
                const result = await mammoth.convertToHtml({ arrayBuffer });
                resolve({ 
                    text: `[CONTENT FROM WORD DOCUMENT "${file.name}":]\n${result.value}` 
                });
            } catch (err) {
                console.error("Mammoth conversion failed", err);
                reject(new Error("Failed to read Word document."));
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
  }

  if (file.type === 'application/pdf') {
     return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result as string;
            const base64Data = base64String.split(',')[1];
            resolve({
                inlineData: {
                    mimeType: 'application/pdf',
                    data: base64Data
                }
            });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
     });
  }

  if (file.type.startsWith('image/')) {
      try {
        const { mimeType, data } = await optimizeImage(file);
        return {
            inlineData: { mimeType, data }
        };
      } catch (error) {
        console.warn("Image optimization failed, falling back to original file", error);
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result as string;
                let mimeType = file.type || 'image/png';
                const base64Data = base64String.split(',')[1];
                resolve({ inlineData: { mimeType, data: base64Data } });
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
      }
  }

  throw new Error(`Unsupported file type: ${file.type}`);
};

/**
 * Helper: Retry mechanism for API calls
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries > 0 && (error.message?.includes('429') || error.message?.includes('503'))) {
      console.warn(`API Busy. Retrying in ${delay}ms... (${retries} left)`);
      await new Promise(res => setTimeout(res, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export const generateHtmlFromImages = async (files: File[]): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const contentParts = await Promise.all(files.map(f => fileToGenerativePart(f)));
    
    contentParts.push({
        text: "Merge these inputs into ONE continuous HTML document. Do not skip any text or questions."
    });

    return await withRetry(async () => {
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview', 
          contents: {
            parts: contentParts
          },
          config: {
            systemInstruction: SYSTEM_PROMPT,
            temperature: 0.1,
          }
        });
        let text = response.text || "";
        text = text.replace(/```html/g, '').replace(/```/g, '').trim();
        return text;
    });

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    const message = error.message || String(error);
    if (message.includes("API key")) throw new Error("Invalid API Key.");
    if (message.includes("429")) throw new Error("Too many requests (429). Please wait and retry.");
    throw new Error(message);
  }
};

export const remixHtmlContent = async (html: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    return await withRetry(async () => {
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `Here is the HTML code:\n\n${html}`,
          config: {
            systemInstruction: REMIX_PROMPT,
            temperature: 0.7,
          }
        });

        let text = response.text || "";
        text = text.replace(/```html/g, '').replace(/```/g, '').trim();
        return text;
    });
  } catch (error: any) {
    throw new Error(error.message || String(error));
  }
};

export const generateSolutionFromHtml = async (html: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    return await withRetry(async () => {
        const response = await ai.models.generateContent({
          model: 'gemini-3-pro-preview',
          contents: `Here is the full HTML content of the exam paper:\n\n${html}\n\nTASK: Generate detailed solutions for EVERY question found in the HTML above.`,
          config: {
            systemInstruction: SOLUTION_PROMPT,
            temperature: 0.2, 
            maxOutputTokens: 8192, 
            thinkingConfig: { thinkingBudget: 1024 } 
          }
        });

        let text = response.text || "";
        text = text.replace(/```html/g, '').replace(/```/g, '').trim();
        return text;
    });
  } catch (error: any) {
    console.error("Gemini API Error (Solution):", error);
    throw new Error(error.message || String(error));
  }
};

// Helper to convert PDF file to array of Base64 Images (Page by Page)
const convertPdfPagesToImages = async (file: File, onProgress?: (pages: number) => void): Promise<string[]> => {
    const arrayBuffer = await file.arrayBuffer();
    // Use the safely resolved pdfjsLib instance
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;
    const images: string[] = [];

    // Limit resolution for speed and token usage (Flash supports text in images well at lower res)
    const SCALE = 2.0; // Increased scale slightly for better Punjabi text recognition

    for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: SCALE }); 
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context!, viewport: viewport }).promise;
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        images.push(dataUrl.split(',')[1]); // Keep only base64 data
        if (onProgress) onProgress(i);
    }
    return images;
};

// --- NEW VOTER EXTRACTION LOGIC (GEMINI BATCH) ---

// Helper for concurrency
async function runConcurrent<T, R>(
  items: T[], 
  concurrency: number, 
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const queue = [...items];
  
  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item) {
        try {
          const result = await fn(item);
          results.push(result);
        } catch (e) {
          console.error("Batch Error", e);
        }
      }
    }
  }

  const workers = Array(Math.min(items.length, concurrency)).fill(null).map(() => worker());
  await Promise.all(workers);
  return results;
}

export const extractVoterData = async (
  file: File, 
  onProgress: (stats: ExtractionProgress) => void
): Promise<any[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // 1. Convert PDF to Images
  onProgress({ totalPages: 0, processedPages: 0, entriesFound: 0, status: "Converting PDF to Images..." });
  
  let images: string[] = [];
  try {
     if (file.type === 'application/pdf') {
         images = await convertPdfPagesToImages(file, (count) => {
            onProgress({ totalPages: 0, processedPages: count, entriesFound: 0, status: `Converted ${count} pages...` });
         });
     } else {
         const { data } = await optimizeImage(file);
         images = [data];
     }
  } catch (e) {
      throw new Error("Failed to read file. Please ensure it is a valid PDF.");
  }

  // --- LOGIC TO SKIP FIRST 2 PAGES (Start from Page 3) ---
  const totalOriginalPages = images.length;
  // If PDF has more than 2 pages, assume standard Voter List structure and skip cover.
  let pagesToProcess = images;
  if (file.type === 'application/pdf' && images.length > 2) {
      pagesToProcess = images.slice(2); 
      onProgress({ 
          totalPages: pagesToProcess.length, 
          processedPages: 0, 
          entriesFound: 0, 
          status: `Skipped cover pages. Processing ${pagesToProcess.length} pages...` 
      });
  }

  const totalPages = pagesToProcess.length;

  // 2. Batch Images
  const batches: string[][] = [];
  for (let i = 0; i < pagesToProcess.length; i += BATCH_SIZE) {
    batches.push(pagesToProcess.slice(i, i + BATCH_SIZE));
  }

  let processedCount = 0;
  let allEntries: any[] = [];

  // 3. Process Batches concurrently
  await runConcurrent(batches, MAX_CONCURRENT_REQUESTS, async (batchImages) => {
     // Prepare parts: Text Prompt + Images
     const parts: any[] = [];
     
     batchImages.forEach(base64 => {
         parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64 } });
     });

     parts.push({ text: `
        Analyze this Punjabi Voter List page. Extract ALL voter entries found.
        Ignore text 'ਫੋਟੋ ਉਪਲਬਧ ਹੈ' (Photo Available).

        **DELETED VOTER LOGIC:**
        Check every voter card for a 'DELETED' stamp, 'DELETED' text across the face, or a cross mark.
        If a voter is deleted, strictly set the 'VoterID' field to "DELETED" and keep other fields if visible, or empty if obliterated.

        **FIELDS TO EXTRACT (JSON keys must be exact):**
        1. SerialNo: The simple number at the top/corner (e.g., 7).
        2. VoterID: The alphanumeric ID (e.g., IFC1629609).
        3. NamePunjabi: Text after 'ਨਾਮ'.
        4. NameEnglish: Transliterate the Punjabi Name to English if not present.
        5. RelationNamePunjabi: Text after 'ਪਿਤਾ' (Father), 'ਮਾਤਾ' (Mother), or 'ਪਤੀ' (Husband).
        6. RelationNameEnglish: Transliterate Relation Name to English.
        7. RelationType: 'Father', 'Mother', or 'Husband'.
        8. HouseNo: Text after 'ਮਕਾਨ ਨੰ.'
        9. Age: Text after 'ਉਮਰ'.
        10. Gender: Text after 'ਲਿੰਗ' (Translate: ਪੁਰਸ਼->Male, ਇਸਤਰੀ->Female).

        Return a strictly valid JSON ARRAY of objects.
     ` });

     try {
         // ADDED RETRY LOGIC HERE
         await withRetry(async () => {
             const result = await ai.models.generateContent({
                 model: 'gemini-3-flash-preview',
                 contents: { parts },
                 config: {
                     responseMimeType: "application/json",
                     responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                SerialNo: { type: Type.STRING },
                                VoterID: { type: Type.STRING },
                                NamePunjabi: { type: Type.STRING },
                                NameEnglish: { type: Type.STRING },
                                RelationNamePunjabi: { type: Type.STRING },
                                RelationNameEnglish: { type: Type.STRING },
                                RelationType: { type: Type.STRING },
                                HouseNo: { type: Type.STRING },
                                Age: { type: Type.STRING },
                                Gender: { type: Type.STRING },
                            }
                        }
                     }
                 }
             });

             const text = result.text;
             if (text) {
                 const data = JSON.parse(text);
                 if (Array.isArray(data)) {
                     allEntries.push(...data);
                 }
             }
         }, 3, 2000); // 3 retries, start with 2s delay

     } catch (e) {
         console.error("Gemini Batch Failed after retries", e);
     } finally {
         processedCount += batchImages.length;
         onProgress({ 
             totalPages, 
             processedPages: processedCount, 
             entriesFound: allEntries.length,
             status: `Analyzing... (${Math.round((processedCount/totalPages)*100)}%)` 
         });
     }
  });

  // Sort by Serial Number numerically
  return allEntries.sort((a, b) => {
      const numA = parseInt(a.SerialNo) || 0;
      const numB = parseInt(b.SerialNo) || 0;
      return numA - numB;
  });
};
