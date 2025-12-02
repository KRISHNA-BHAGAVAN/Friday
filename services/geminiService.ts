import { GoogleGenAI, Type } from "@google/genai";

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
 * Suggests a category icon/emoji for a task.
 */
export const suggestCategory = async (taskText: string): Promise<string> => {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Suggest a single emoji that best represents this task: "${taskText}". Return only the emoji character.`,
            config: {
                maxOutputTokens: 5,
            }
        });
        return response.text?.trim() || '📝';
    } catch (error) {
        return '📝';
    }
}