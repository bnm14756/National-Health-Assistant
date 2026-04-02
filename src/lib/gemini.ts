import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const analyzeFood = async (imageBase64: string) => {
  const model = "gemini-3-flash-preview";
  const prompt = `당신은 고혈압과 당뇨 관리를 돕는 친절한 '국민 건강 비서'입니다. 
  사용자가 제출한 식단 사진을 보고 다음을 상세히 분석해주세요:
  1. 음식 이름 (foodName)
  2. 추정 칼로리 (calories, 숫자만)
  3. 영양 성분 분석 (탄수화물, 단백질, 지방 함량 추정치)
  4. 고혈압/당뇨 환자에게 좋은 점과 주의할 점 (analysis)
  5. 사용자에게 드리는 따뜻하고 구체적인 조언 (advice)
  6. 건강 등급 (rating: good, moderate, bad)
  
  답변은 친절하고 정중한 한국어로 해주세요.`;

  const response = await ai.models.generateContent({
    model,
    contents: [
      { text: prompt },
      { inlineData: { data: imageBase64.split(',')[1], mimeType: "image/jpeg" } }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          foodName: { type: Type.STRING },
          calories: { type: Type.NUMBER },
          carbs: { type: Type.STRING, description: "탄수화물 함량 (예: 30g)" },
          protein: { type: Type.STRING, description: "단백질 함량 (예: 15g)" },
          fat: { type: Type.STRING, description: "지방 함량 (예: 10g)" },
          analysis: { type: Type.STRING },
          advice: { type: Type.STRING },
          rating: { type: Type.STRING, enum: ["good", "moderate", "bad"] }
        },
        required: ["foodName", "calories", "carbs", "protein", "fat", "analysis", "advice", "rating"]
      }
    }
  });

  return JSON.parse(response.text);
};

export const analyzeReadingImage = async (imageBase64: string) => {
  const model = "gemini-3-flash-preview";
  const prompt = `혈압계 또는 혈당계 화면 사진입니다. 
  숫자를 정확히 추출해주세요. 
  혈압계라면 수축기(systolic), 이완기(diastolic)를, 
  혈당계라면 혈당 수치(sugarLevel)를 추출하세요.
  어떤 기기인지도 판단해주세요.`;

  const response = await ai.models.generateContent({
    model,
    contents: [
      { text: prompt },
      { inlineData: { data: imageBase64.split(',')[1], mimeType: "image/jpeg" } }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          deviceType: { type: Type.STRING, enum: ["blood_pressure", "blood_sugar"] },
          systolic: { type: Type.NUMBER },
          diastolic: { type: Type.NUMBER },
          sugarLevel: { type: Type.NUMBER }
        },
        required: ["deviceType"]
      }
    }
  });

  return JSON.parse(response.text);
};

export const getHealthAdvice = async (history: any[]) => {
  const model = "gemini-3-flash-preview";
  const historyText = JSON.stringify(history);
  const prompt = `최근 건강 기록입니다: ${historyText}. 
  이 기록을 바탕으로 사용자에게 드릴 건강 조언(Clinical Insight)을 3가지 핵심 포인트로 작성해주세요. 
  각 포인트는 한 줄씩 명확하게 작성하세요. 
  친절하고 정중한 한국어를 사용하세요.
  형식:
  1. [첫 번째 조언]
  2. [두 번째 조언]
  3. [세 번째 조언]`;

  const response = await ai.models.generateContent({
    model,
    contents: historyText ? [{ text: prompt }] : [{ text: "건강 관리를 시작하시는 사용자분께 따뜻한 응원의 메시지를 보내주세요." }],
  });

  return response.text;
};
