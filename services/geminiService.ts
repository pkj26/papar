import { GoogleGenAI } from "@google/genai";

const SYSTEM_PROMPT = `
You are an expert Frontend Engineer and UI Designer.
Your task is to convert an image of a document or web page into a PIXEL-PERFECT HTML/Tailwind CSS replica.

**Instructions:**
1. **Analyze**: Look at the layout, typography, colors, and spacing of the image.
2. **Replicate**: Create an HTML structure that looks EXACTLY like the image.
   - Use **Tailwind CSS** for the main styling.
   - **CRITICAL FOR WORD COMPATIBILITY**: You MUST ALSO use **inline \`style="..."\` attributes** for critical layout properties (width, background-color, font-size, borders, padding). 
     - *Reason*: The user will export this to MS Word, which ignores Tailwind classes. Inline styles ensure the design stays intact in Word.
   - Match fonts (use standard web safe fonts like Arial, Times New Roman, Roboto).
   - If there are tables, recreate them using HTML <table> with inline borders.
3. **Content**: Extract all text accurately.
4. **Images**: If there are sub-images, use a placeholder or ignore, focus on Text and Layout.

**Output Rules:**
* Return ONLY the HTML code for the content container.
* Do NOT include <html>, <head>, or <body> tags.
* Do NOT use markdown code blocks.
* Ensure the code is responsive but optimized for print and MS Word export.
`;

/**
 * Resizes and compresses an image file to reduce payload size and speed up API processing.
 * Max dimension: 1536px (enough for A4 clarity)
 * Quality: 0.7 JPEG
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
        const MAX_DIM = 1536; // Optimized for speed while maintaining text legibility

        // Calculate new dimensions
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

        // Draw with white background (handles transparent PNGs converting to JPEG)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to JPEG with compression
        const mimeType = 'image/jpeg';
        const quality = 0.7; // 70% quality is sufficient for OCR/Layout and much faster
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

export const fileToGenerativePart = async (file: File): Promise<{ mimeType: string; data: string }> => {
  // Always optimize/compress the image regardless of type.
  // This standardizes inputs to JPEG and reduces size significantly.
  try {
    return await optimizeImage(file);
  } catch (error) {
    console.warn("Image optimization failed, falling back to original file", error);
    
    // Fallback to original method if canvas fails
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const matches = base64String.match(/^data:([^;]+);base64,/);
        let mimeType = matches ? matches[1] : file.type;
        if (!mimeType || mimeType === 'application/octet-stream') {
          mimeType = 'image/png';
        }
        const base64Data = base64String.split(',')[1];
        resolve({ mimeType, data: base64Data });
      };
      reader.onerror = (err) => reject(new Error("Failed to read file: " + err));
      reader.readAsDataURL(file);
    });
  }
};

const getApiKey = (): string => {
  const isValid = (key: any) => typeof key === 'string' && key.length > 0;

  if (typeof process !== 'undefined' && process.env) {
    if (isValid(process.env.API_KEY)) return process.env.API_KEY!;
    if (isValid(process.env.VITE_API_KEY)) return process.env.VITE_API_KEY!;
    if (isValid(process.env.REACT_APP_API_KEY)) return process.env.REACT_APP_API_KEY!;
    if (isValid(process.env.NEXT_PUBLIC_API_KEY)) return process.env.NEXT_PUBLIC_API_KEY!;
  }

  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      // @ts-ignore
      if (isValid(import.meta.env.API_KEY)) return import.meta.env.API_KEY;
      // @ts-ignore
      if (isValid(import.meta.env.VITE_API_KEY)) return import.meta.env.VITE_API_KEY;
      // @ts-ignore
      if (isValid(import.meta.env.NEXT_PUBLIC_API_KEY)) return import.meta.env.NEXT_PUBLIC_API_KEY;
    }
  } catch (e) {}
  
  throw new Error("API Key Missing. In Vercel Settings, try naming your variable 'VITE_API_KEY' (or 'REACT_APP_API_KEY') and then REDEPLOY the project.");
};

export const generateHtmlFromImage = async (file: File): Promise<string> => {
  let apiKey: string;
  try {
    apiKey = getApiKey();
  } catch (e: any) {
    throw new Error(e.message);
  }

  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const { mimeType, data } = await fileToGenerativePart(file);

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: data
            }
          },
          {
            text: "Create a pixel-perfect HTML/Tailwind replica of this image."
          }
        ]
      },
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.1,
      }
    });

    let text = response.text || "";
    text = text.replace(/```html/g, '').replace(/```/g, '').trim();
    
    return text;
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    const message = error.message || String(error);
    if (message.includes("API key") || message.includes("403")) {
      throw new Error("Invalid API Key. Please check your Vercel Environment Variables.");
    }
    if (message.includes("429")) {
        throw new Error("Too many requests (429). Please Retry.");
    }
    throw new Error(message);
  }
};