import { GoogleGenAI, Modality, Type } from "@google/genai";
import { OfficialDocInfo } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Decodes base64 string to audio bytes
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Decodes raw PCM/Audio data into an AudioBuffer
export async function decodeAudioData(
  base64Data: string,
  ctx: AudioContext,
  sampleRate: number = 24000
): Promise<AudioBuffer> {
  const bytes = decode(base64Data);
  
  const dataInt16 = new Int16Array(bytes.buffer);
  const numChannels = 1;
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export const translateDocument = async (
  base64Data: string,
  mimeType: string,
  targetLanguage: string,
  mode: 'speed' | 'detailed'
): Promise<{ 
  text: string; 
  summary: string; 
  actionItems: string[];
  address: string | null; 
  officialInfo: OfficialDocInfo | null 
}> => {
  try {
    const thinkingBudget = mode === 'speed' ? 0 : 2048;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data,
            },
          },
          {
            text: `You are an intelligent document assistant specializing in accessibility.
            1. Analyze the provided document (it could be a standard letter, a bill, or a Government Order/Form).
            2. Extract all visible text and translate it accurately into ${targetLanguage}. Maintain the original formatting (lists, paragraphs) using Markdown.
            3. Create a simplified, easy-to-understand "Summary" in ${targetLanguage} that explains the core message to someone with low literacy.
            4. Detect if this is an Official Government Document (like a GO, Circular, or Form). If yes, extract:
               - GO Number / File Number
               - Department Name
               - Date
               - Subject / Abstract
            5. Identify if there is a specific physical address mentioned (e.g., office location).
            6. Extract a list of specific "Action Items" in ${targetLanguage}. These are things the user needs to do (e.g., "Submit by Friday", "Attach Aadhar Card", "Sign at the bottom").
            
            Return the result in JSON format.`,
          },
        ],
      },
      config: {
        thinkingConfig: { thinkingBudget: thinkingBudget },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            translation: { type: Type.STRING, description: "Full translated text in markdown" },
            summary: { type: Type.STRING, description: "Simple summary for common people" },
            actionItems: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "List of tasks or actions the user needs to perform" 
            },
            address: { type: Type.STRING, nullable: true },
            isOfficialDocument: { type: Type.BOOLEAN },
            officialDetails: {
              type: Type.OBJECT,
              properties: {
                goNumber: { type: Type.STRING, nullable: true },
                department: { type: Type.STRING, nullable: true },
                date: { type: Type.STRING, nullable: true },
                subject: { type: Type.STRING, nullable: true }
              },
              nullable: true
            }
          },
          required: ["translation", "summary", "isOfficialDocument", "actionItems"]
        }
      }
    });

    if (response.text) {
      const result = JSON.parse(response.text);
      
      let officialInfo: OfficialDocInfo | null = null;
      if (result.isOfficialDocument) {
        officialInfo = {
          isOfficial: true,
          goNumber: result.officialDetails?.goNumber,
          department: result.officialDetails?.department,
          date: result.officialDetails?.date,
          subject: result.officialDetails?.subject
        };
      }

      return {
        text: result.translation || "Could not extract text.",
        summary: result.summary || "No summary available.",
        actionItems: result.actionItems || [],
        address: result.address || null,
        officialInfo: officialInfo
      };
    }
    
    return { text: "Could not extract text.", summary: "", actionItems: [], address: null, officialInfo: null };

  } catch (error) {
    console.error("Translation error:", error);
    throw new Error("Failed to translate document.");
  }
};

export const resolveLocation = async (address: string): Promise<{ latitude?: number, longitude?: number, mapUri?: string }> => {
  try {
    // Using gemini-2.5-flash for Maps Grounding
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Get the precise latitude and longitude coordinates for this address: "${address}". 
      Format your response exactly like this: "LAT: 12.3456, LNG: 67.8901".`,
      config: {
        tools: [{ googleMaps: {} }],
      },
    });

    const text = response.text || "";
    let latitude: number | undefined;
    let longitude: number | undefined;

    // Parse text for coordinates
    const latMatch = text.match(/LAT:\s*(-?\d+(\.\d+)?)/i);
    const lngMatch = text.match(/LNG:\s*(-?\d+(\.\d+)?)/i);

    if (latMatch && lngMatch) {
      latitude = parseFloat(latMatch[1]);
      longitude = parseFloat(lngMatch[1]);
    }

    // Extract map URI from grounding chunks
    let mapUri: string | undefined;
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (groundingChunks) {
      for (const chunk of groundingChunks) {
        if (chunk.web?.uri) {
           // Sometimes maps grounding returns web uri for the place
           mapUri = chunk.web.uri;
           break;
        }
      }
    }

    return { latitude, longitude, mapUri };
  } catch (error) {
    console.error("Location resolution error:", error);
    return {};
  }
};

export const generateSpeech = async (text: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) {
      throw new Error("No audio data received.");
    }
    return audioData;
  } catch (error) {
    console.error("TTS error:", error);
    throw new Error("Failed to generate speech.");
  }
};
