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
5. **Watermark Removal (CRITICAL)**: 
   - **IGNORE** any watermarks, stamps, or overlay text (e.g., "Sample", "Copyright", "Confidential", Website URLs, or diagonal text) that obscures the content.
   - **DO NOT** transcribe the watermark text into the HTML.
   - **DO NOT** create visual elements (like faded divs) for the watermark. 
   - Pretend the watermark does not exist and reconstruct the text/tables underneath it cleanly.

**Output Rules:**
* Return ONLY the HTML code for the content container.
* Do NOT include <html>, <head>, or <body> tags.
* Do NOT use markdown code blocks.
* Ensure the code is responsive but optimized for print and MS Word export.
`;

const REMIX_PROMPT = `
You are an expert Exam Setter and Teacher.
I will provide you with HTML code representing an exam paper or worksheet.
Your task is to **CREATE A NEW VERSION** of this test paper by changing the questions, while keeping the **EXACT SAME LAYOUT AND STYLING**.

**Instructions:**
1. **Analyze Context**: Identify the subject (Math, Science, History, etc.) and the topic of the questions.
2. **Modify Questions**:
   - **Mathematics/Physics**: Change the numbers/values in the problems. Keep the logic and formula required the same. (e.g., if 2x + 4 = 10, change to 3x + 6 = 15).
   - **Theory (History/Bio/English)**: Replace the question with a DIFFERENT valid question from the SAME TOPIC/CHAPTER. (e.g., If asking about Newton's 1st Law, ask about Newton's 2nd Law or an example of the 1st Law).
   - **Multiple Choice**: Change the question and the options. Ensure there is still one correct answer.
3. **Preserve Structure**:
   - **DO NOT CHANGE** the HTML structure, classes, or inline styles. The visual look must be identical.
   - **DO NOT CHANGE** static headers like "School Name", "Time Allowed", "Instructions", "Student Name", "Roll No". Only change the actual content of the questions.
4. **Clean Up**: If any watermark text accidentally remained in the source HTML, remove it in this version.

**Output Rules:**
* Return ONLY the HTML code.
* Do NOT include markdown formatting.
`;

const SOLUTION_PROMPT = `
You are an expert Professor and Tutor.
I will provide you with HTML code containing exam questions.
Your task is to generate a **Professional Solution Key** for these questions suitable for printing.

**Instructions:**
1. **Parse**: Read the questions from the provided HTML. **Ignore any text that looks like a watermark or artifact.**
2. **Format**: For EACH question found, create a distinct "Solution Block".
   - **Container**: Wrap the Question-Answer pair in a <div class="solution-block" style="margin-bottom: 25px; page-break-inside: avoid; border-bottom: 1px dashed #e5e7eb; padding-bottom: 20px;">.
   - **Question Section**: 
     - Use a light gray background box for the question text so it stands out.
     - Style: <div style="background-color: #f3f4f6; padding: 12px; border-radius: 6px; font-weight: bold; color: #111827; margin-bottom: 12px; font-size: 16px; border-left: 4px solid #4b5563;">Q: [Insert Question Text]</div>
   - **Answer Section**: 
     - Provide a clear, detailed step-by-step solution.
     - Style: <div style="padding-left: 8px; color: #374151; line-height: 1.6; font-size: 15px;">[Insert Detailed Solution]</div>
   - **Math**: If it is a math problem, show steps clearly using standard text representation or simple HTML.
   - **Code**: If it asks for code, use a <pre> block with a border.

**Output Rules:**
* Return ONLY the HTML code for the solution body.
* Do NOT return markdown.
* Use inline styles for maximum compatibility with PDF generators.
* Do not include the main header (Subject, Time, etc), just the list of questions and answers.
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

export const remixHtmlContent = async (html: string): Promise<string> => {
  let apiKey: string;
  try {
    apiKey = getApiKey();
  } catch (e: any) {
    throw new Error(e.message);
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        role: 'user',
        parts: [{ text: `Here is the HTML code:\n\n${html}` }]
      },
      config: {
        systemInstruction: REMIX_PROMPT,
        temperature: 0.7, // Higher temperature for creativity in new questions
      }
    });

    let text = response.text || "";
    text = text.replace(/```html/g, '').replace(/```/g, '').trim();

    return text;
  } catch (error: any) {
    console.error("Gemini API Error (Remix):", error);
    const message = error.message || String(error);
    if (message.includes("429")) {
        throw new Error("Too many requests (429). Please wait a moment and retry.");
    }
    throw new Error(message);
  }
};

export const generateSolutionFromHtml = async (html: string): Promise<string> => {
  let apiKey: string;
  try {
    apiKey = getApiKey();
  } catch (e: any) {
    throw new Error(e.message);
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        role: 'user',
        parts: [{ text: `Here is the questions HTML:\n\n${html}` }]
      },
      config: {
        systemInstruction: SOLUTION_PROMPT,
        temperature: 0.4, // Balanced for factual accuracy and good explanation
      }
    });

    let text = response.text || "";
    text = text.replace(/```html/g, '').replace(/```/g, '').trim();

    return text;
  } catch (error: any) {
    console.error("Gemini API Error (Solution):", error);
    const message = error.message || String(error);
    if (message.includes("429")) {
        throw new Error("Too many requests (429). Please wait a moment and retry.");
    }
    throw new Error(message);
  }
};