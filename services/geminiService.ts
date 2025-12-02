import { GoogleGenAI, Type } from "@google/genai";
import { Reminder } from "../types";

// Initialize the client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Uses Gemini to break down a complex task into smaller, actionable subtasks.
 */
export const breakDownTask = async (taskText: string): Promise<string[]> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Break down the following task into 3 to 5 smaller, actionable sub-tasks. Keep them concise. Task: "${taskText}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING
          },
          description: "A list of actionable subtasks."
        }
      }
    });

    if (response.text) {
      const subtasks = JSON.parse(response.text);
      if (Array.isArray(subtasks)) {
        return subtasks;
      }
    }
    return [];
  } catch (error) {
    console.error("Failed to breakdown task with Gemini:", error);
    // Fail gracefully by returning empty array
    return [];
  }
};

/**
 * Analyzes task input to extract clean text, category, and reminder details.
 */
export const analyzeTask = async (input: string): Promise<{ text: string; category: string; reminder?: Reminder }> => {
  const now = new Date().toISOString();
  const userLocale = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `
        Analyze this task input: "${input}".
        Current time: ${now}. User Timezone: ${userLocale}.
        
        1. "text": The task description with time/date words removed (e.g. "Buy milk tomorrow" -> "Buy milk").
        2. "category": A single emoji representing the task.
        3. "reminder": If there is a specific time/date or recurrence mentioned, provide details. Otherwise null.
           - "isoString": The ISO 8601 timestamp for the NEXT occurrence.
           - "recurrence": "daily", "weekly", "monthly", "yearly" or null.
        
        Return JSON.
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING },
            category: { type: Type.STRING },
            reminder: {
              type: Type.OBJECT,
              properties: {
                isoString: { type: Type.STRING },
                recurrence: { type: Type.STRING, enum: ["daily", "weekly", "monthly", "yearly"] },
              },
              nullable: true,
            }
          },
          required: ["text", "category"]
        }
      }
    });

    if (response.text) {
      const data = JSON.parse(response.text);
      // Validate structure roughly
      return {
        text: data.text || input,
        category: data.category || '📝',
        reminder: data.reminder || undefined
      };
    }
    throw new Error("Empty response");
  } catch (error) {
    console.error("Gemini analysis failed:", error);
    // Fallback
    return {
      text: input,
      category: '📝'
    };
  }
};