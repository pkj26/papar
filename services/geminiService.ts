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
      const base64Data = base64String.split(',')[1];
      resolve({ mimeType: file.type, data: base64Data });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const generateHtmlFromImage = async (file: File): Promise<string> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key not found in environment variables.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const { mimeType, data } = await fileToGenerativePart(file);

  try {
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
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("Failed to generate HTML. Please try again.");
  }
};