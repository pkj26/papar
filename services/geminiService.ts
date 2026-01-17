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
const BATCH_SIZE = 1; 

// STRICT SINGLE CONCURRENCY FOR FREE TIER
const MAX_CONCURRENT_REQUESTS = 1; 

// GEMINI FREE TIER LIMIT: 15 Requests Per Minute (RPM)
// We set this to 12 seconds (5 RPM) to be extremely safe against Quota errors.
const MIN_REQUEST_DELAY = 12000; 

let lastRequestTime = 0;

export interface ExtractionProgress {
    totalPages: number;
    processedPages: number;
    entriesFound: number;
    status: string;
}

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
 * SINGLE KEY EXECUTION WITH ROBUST RETRY
 */
async function generateWithRetry(
    payloadFn: (ai: GoogleGenAI) => Promise<any>
): Promise<any> {
    const maxRetries = 10; 
    let attempts = 0;

    // 1. Try process.env (Node/Webpack)
    let apiKey = process.env.API_KEY;

    // 2. Try Vite/Next.js specific env vars if process.env failed
    if (!apiKey) {
        try {
            // @ts-ignore
            apiKey = import.meta.env?.VITE_API_KEY || import.meta.env?.NEXT_PUBLIC_API_KEY;
        } catch(e) {
            // Ignore error if import.meta is not available
        }
    }

    if (!apiKey) throw new Error("API Key is missing. Please set API_KEY or VITE_API_KEY in your environment variables.");

    while (attempts < maxRetries) {
        try {
            // 1. Throttle to comply with RPM limits
            const now = Date.now();
            const timeSinceLast = now - lastRequestTime;
            const waitTime = Math.max(0, MIN_REQUEST_DELAY - timeSinceLast);
            
            if (waitTime > 0) {
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
            
            // 2. Execute
            lastRequestTime = Date.now(); 
            const ai = new GoogleGenAI({ apiKey });
            const result = await payloadFn(ai);
            return result; 
            
        } catch (error: any) {
            attempts++;
            const msg = (error.message || error.toString()).toLowerCase();
            const isQuota = msg.includes('429') || msg.includes('quota') || msg.includes('limit') || msg.includes('503');
            const isNotFound = msg.includes('404') || msg.includes('not found');

            if (isNotFound) {
               // 404s are usually configuration errors (wrong model), not transient.
               // We rethrow so the fallback logic in the caller can switch models.
               throw error; 
            }

            if (isQuota) {
                // If quota hit, it means we are still going too fast.
                // Wait a VERY LONG block of time (30-60 seconds).
                const delay = 30000 + (Math.random() * 30000); 
                console.warn(`Quota limit reached (Attempt ${attempts}/${maxRetries}). Pausing for ${Math.round(delay/1000)}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            
            // If it's a 5xx error (server side), retry quickly
            if (msg.includes('500') || msg.includes('502') || msg.includes('503')) {
                 await new Promise(resolve => setTimeout(resolve, 5000));
                 continue;
            }

            throw error; // Throw other errors (400, 401, etc)
        }
    }
    throw new Error("API Limit exceeded after multiple retries. You have likely hit the DAILY quota. Please try again tomorrow.");
}

function repairJsonString(jsonString: string): string {
    jsonString = jsonString.trim();
    jsonString = jsonString.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '');
    try {
        JSON.parse(jsonString);
        return jsonString;
    } catch (e) {
        if (jsonString.startsWith('{')) {
            const lastBrace = jsonString.lastIndexOf('}');
            if (lastBrace > -1) {
                return jsonString.substring(0, lastBrace + 1);
            }
        } else if (jsonString.startsWith('[')) {
             const lastObjectEnd = jsonString.lastIndexOf('}');
             if (lastObjectEnd > -1) {
                 return jsonString.substring(0, lastObjectEnd + 1) + ']';
             }
        }
        return "[]";
    }
}

function cleanMarkdownHtml(text: string): string {
    return text.trim().replace(/^```html/, '').replace(/^```/, '').replace(/```$/, '');
}

/**
 * Smart Generator that attempts primary model then falls back to alias.
 */
async function generateContentWithFallback(
    parts: any[], 
    jsonMode: boolean = true
): Promise<any> {
    const performGen = async (model: string) => {
        return generateWithRetry(async (ai) => {
             const result = await ai.models.generateContent({
                 model,
                 contents: { parts },
                 config: jsonMode ? { responseMimeType: "application/json" } : undefined
             });
             let text = result.text || "";
             if (jsonMode) {
                 text = repairJsonString(text);
                 return JSON.parse(text);
             } else {
                 return cleanMarkdownHtml(text);
             }
        });
    };

    // 1. Try Primary Model (Gemini 3 Flash Preview)
    try {
        return await performGen('gemini-3-flash-preview');
    } catch (e: any) {
        const msg = (e.message || e.toString()).toLowerCase();
        // 2. If 404 (Not Found), Fallback to Stable Alias
        if (msg.includes('404') || msg.includes('not found')) {
            console.warn("Primary model not found (404), falling back to 'gemini-flash-latest'.");
            return await performGen('gemini-flash-latest');
        }
        throw e;
    }
}

// --- CORE GENERATION FUNCTIONS ---

export const generateHtmlFromImages = async (files: File[]): Promise<string> => {
    const parts: any[] = [];
    for (const file of files) {
        const part = await fileToGenerativePart(file);
        parts.push(part);
    }

    parts.push({ text: `
    Role: Expert Frontend Developer & UI Designer.
    Task: Convert the provided images (Question Paper, Document, or Worksheet) into a PIXEL-PERFECT HTML page using Tailwind CSS.
    
    Strict Guidelines:
    1. **Fidelity**: The output must look EXACTLY like the input image in terms of layout, spacing, alignment, and structure.
    2. **Typography**: Match font weights (Bold/Italic) and relative sizes. Use standard sans-serif fonts.
    3. **Content**: Extract ALL text, numbers, and tables accurately. Do not summarize.
    4. **Styling**: 
       - Use Tailwind CSS classes.
       - Background should be white. 
       - Text should be black/gray-900.
       - Tables should have borders matching the original.
    5. **Structure**: 
       - Wrap the content in a <div class="p-6 bg-white"> container.
       - Do NOT output <html>, <head>, or <body> tags. Just the internal component HTML.
    
    Output: Return ONLY the raw HTML string. Do not use Markdown code blocks.
    `});

    return await generateContentWithFallback(parts, false);
};

export const remixHtmlContent = async (html: string): Promise<string> => {
    return await generateContentWithFallback([
        { text: `
        Task: Remix/Modify this Question Paper HTML while strictly preserving the HTML structure and Tailwind classes.
        
        Instructions:
        1. Keep the same topics, difficulty, and format.
        2. Change specific numerical values (e.g., "50kg" -> "75kg").
        3. Change names of people/places (e.g., "Ram" -> "Arjun").
        4. Shuffle the order of multiple-choice options (A, B, C, D) if present.
        5. DO NOT change the CSS classes or layout structure.
        
        Input HTML:
        ${html}
        
        Output: Return ONLY the modified raw HTML string.
        ` }
    ], false);
};

export const generateSolutionFromHtml = async (html: string): Promise<string> => {
    return await generateContentWithFallback([
        { text: `
        Task: Generate a detailed, step-by-step Solution Sheet for the following Question Paper HTML.
        
        Instructions:
        1. For each question found in the HTML, provide a clear solution.
        2. Use a "Handwritten" aesthetic for the output:
           - Use font-family: 'Kalam', cursive; (I will inject the font, just use the style).
           - Text color: #1e3a8a (Dark Blue like a pen).
        3. Format:
           - **Question X**: [Brief recap of question]
           - **Solution**: [Step-by-step calculation or reasoning]
           - **Answer**: [Final Answer in Bold]
        4. Styling: Use Tailwind CSS. Wrap each solution in a <div class="mb-6 p-4 border-b border-blue-100">.
        
        Input HTML:
        ${html}
        
        Output: Return ONLY the raw HTML string for the solutions.
        ` }
    ], false);
};

// Helper to convert PDF file to array of Base64 Images (Page by Page)
const convertPdfPagesToImages = async (file: File, onProgress?: (pages: number) => void): Promise<string[]> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;
    const images: string[] = [];
    const SCALE = 2.0;

    for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: SCALE }); 
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context!, viewport: viewport }).promise;
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        images.push(dataUrl.split(',')[1]); 
        if (onProgress) onProgress(i);
    }
    return images;
};

// --- VOTER EXTRACTION LOGIC ---

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

/**
 * STEP 1: Extract Cover Page Data
 */
async function extractCoverData(imageBase64: string): Promise<any> {
    return generateContentWithFallback(
        [
            { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
            { text: `
                Extract Electoral Roll Metadata from this page.
                Look for keywords like: "District", "Zilla", "Assembly Constituency", "Vidhan Sabha Halqa", "Police Station", "Thana", "Polling Station", "Polling Area".
                
                Return JSON:
                {
                   "District": "...",
                   "ACNo": "...",
                   "ACName": "...",
                   "PoliceStation": "...",
                   "PostOffice": "...",
                   "PollingStationName": "...",
                   "PollingStationAddress": "...",
                   "PartNo": "..."
                }
            ` }
        ],
        true // JSON mode
    );
}

export const extractVoterData = async (
  file: File, 
  startPage: number, 
  onProgress: (stats: ExtractionProgress) => void,
  onBatchComplete?: (newData: any[]) => void
): Promise<any[]> => {

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
      throw new Error("Failed to read file.");
  }

  let coverData: any = {
      District: "", ACNo: "", ACName: "", PoliceStation: "", 
      PostOffice: "", PollingStationName: "", PollingStationAddress: "", PartNo: ""
  };
  
  let voterPages: string[] = [];

  if (file.type === 'application/pdf' && images.length >= 2) {
      voterPages = images.slice(2); 
      try {
        onProgress({ totalPages: images.length, processedPages: 0, entriesFound: 0, status: "Analyzing Cover Page..." });
        // Extract cover data
        let extractedCover = await extractCoverData(images[0]);
        coverData = { ...coverData, ...extractedCover };
      } catch (e) {
          console.error("Cover page extraction failed.", e);
          // Proceed without cover data
      }
  } else {
      voterPages = images;
  }

  const totalVoterPages = voterPages.length;
  const pagesToProcess = voterPages.slice(startPage);
  
  if (pagesToProcess.length === 0) return [];

  const batches: string[][] = [];
  for (let i = 0; i < pagesToProcess.length; i += BATCH_SIZE) {
    batches.push(pagesToProcess.slice(i, i + BATCH_SIZE));
  }

  let processedCount = startPage;
  let allEntries: any[] = [];

  // Run batches with strictly 1 concurrent request
  await runConcurrent(batches, MAX_CONCURRENT_REQUESTS, async (batchImages) => {
     const parts: any[] = [];
     batchImages.forEach(base64 => {
         parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64 } });
     });

     parts.push({ text: `
        Analyze this Punjabi Voter List page.
        
        **TASK 1: HEADER**
        Extract: District, ACNo, ACName, PoliceStation, PostOffice, PollingStationName, PollingStationAddress, PartNo, SectionNo, SectionName.

        **TASK 2: VOTERS**
        Extract ALL voter entries.
        Fields: SerialNo, VoterID, NamePunjabi, NameEnglish, RelationNamePunjabi, RelationNameEnglish, RelationType, HouseNo, Age, Gender.
        
        Return JSON Object with "header" and "voters" array.
     ` });

     try {
         // Using the fallback-aware generator
         const data = await generateContentWithFallback(parts, true);
             
         const pageHeader = data.header || {};
         const pageVoters = Array.isArray(data.voters) ? data.voters : [];

         const enrichedVoters = pageVoters.map((v: any) => ({
             District: pageHeader.District || coverData.District || "",
             ACNo: pageHeader.ACNo || coverData.ACNo || "",
             ACName: pageHeader.ACName || coverData.ACName || "",
             PoliceStation: pageHeader.PoliceStation || coverData.PoliceStation || "",
             PostOffice: pageHeader.PostOffice || coverData.PostOffice || "",
             PollingStationName: pageHeader.PollingStationName || coverData.PollingStationName || "",
             PollingStationAddress: pageHeader.PollingStationAddress || coverData.PollingStationAddress || "",
             PartNo: pageHeader.PartNo || coverData.PartNo || "",
             SectionNo: pageHeader.SectionNo || coverData.SectionNo || "",
             SectionName: pageHeader.SectionName || coverData.SectionName || "",
             ...v
         }));
         
         if(onBatchComplete) {
            onBatchComplete(enrichedVoters);
         }

         allEntries.push(...enrichedVoters);

     } catch (e) {
         console.error("Batch Failed", e);
     } finally {
         processedCount += batchImages.length;
         onProgress({ 
             totalPages: totalVoterPages, 
             processedPages: processedCount, 
             entriesFound: allEntries.length,
             status: `Analyzing... (${Math.round((processedCount/totalVoterPages)*100)}%)` 
         });
     }
  });

  return allEntries.sort((a, b) => (parseInt(a.SerialNo) || 0) - (parseInt(b.SerialNo) || 0));
};
