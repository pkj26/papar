import { GoogleGenAI } from "@google/genai";

const SYSTEM_PROMPT = `
You are an expert Frontend Engineer and UI Designer.
Your task is to convert an image of a document or web page into a PIXEL-PERFECT HTML/Tailwind CSS replica.

**Instructions:**
1. **Analyze**: Look at the layout, typography, colors, and spacing of the image.
2. **Replicate**: Create an HTML structure that looks EXACTLY like the image.
   - Use Tailwind CSS for all styling.
   - Match fonts (use standard web safe fonts that look similar).
   - Match background colors, borders, and padding.
   - If there are tables, recreate them using HTML <table>.
3. **Content**: Extract all text accurately.
4. **Images**: If there are sub-images within the page, ignore them or place a placeholder, focus primarily on replicating the Text and Table structure exactly as it appears.

**Output Rules:**
* Return ONLY the HTML code for the content container (div, table, section, etc.).
* Do NOT include <html>, <head>, or <body> tags.
* Do NOT use markdown code blocks.
* Ensure the code is responsive but optimized for print.
`;

/**
 * Converts a BMP file to a PNG base64 representation.
 */
const convertBmpToPng = (file: File): Promise<{ mimeType: string; data: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context for BMP conversion'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        const pngDataUrl = canvas.toDataURL('image/png');
        const base64Data = pngDataUrl.split(',')[1];
        resolve({ mimeType: 'image/png', data: base64Data });
      };
      img.onerror = (err) => reject(new Error('Failed to load BMP image for conversion'));
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const fileToGenerativePart = async (file: File): Promise<{ mimeType: string; data: string }> => {
  if (file.type === 'image/bmp') {
     return convertBmpToPng(file);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      
      // Robust MIME type detection from the Data URL
      // Data URL format: data:[<mediatype>][;base64],<data>
      const matches = base64String.match(/^data:([^;]+);base64,/);
      let mimeType = matches ? matches[1] : file.type;

      // Fallback if MIME type is empty or unknown (common with clipboard files)
      if (!mimeType || mimeType === 'application/octet-stream') {
        mimeType = 'image/png'; // Assume PNG for unknown image clipboard data
      }

      const base64Data = base64String.split(',')[1];
      resolve({ mimeType, data: base64Data });
    };
    reader.onerror = (error) => reject(new Error("Failed to read file: " + error));
    reader.readAsDataURL(file);
  });
};

const getApiKey = (): string => {
  // Helper to safely return a valid string key
  const isValid = (key: any) => typeof key === 'string' && key.length > 0;

  // 1. Check standard process.env (Node/Webpack)
  if (typeof process !== 'undefined' && process.env) {
    if (isValid(process.env.API_KEY)) return process.env.API_KEY!;
    if (isValid(process.env.VITE_API_KEY)) return process.env.VITE_API_KEY!;
    if (isValid(process.env.REACT_APP_API_KEY)) return process.env.REACT_APP_API_KEY!;
    if (isValid(process.env.NEXT_PUBLIC_API_KEY)) return process.env.NEXT_PUBLIC_API_KEY!;
  }

  // 2. Check import.meta.env (Vite standard)
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
  } catch (e) {
    // Ignore import.meta access errors
  }
  
  // If we reach here, no key was found.
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
        temperature: 0.1, // Low temperature for high fidelity reproduction
      }
    });

    let text = response.text || "";
    text = text.replace(/```html/g, '').replace(/```/g, '').trim();
    
    return text;
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    // Return a descriptive error message
    const message = error.message || String(error);
    if (message.includes("API key") || message.includes("403")) {
      throw new Error("Invalid API Key. Please check your Vercel Environment Variables.");
    }
    throw new Error(message);
  }
};