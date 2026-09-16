import axios from 'axios';
import fs from 'fs';

async function testGeminiImage() {
  const apiKey = process.env.GEMINI_API_KEY || '';
  const models = [
    'gemini-2.5-flash-image',
    'gemini-3.1-flash-image',
    'gemini-3-pro-image'
  ];

  for (const m of models) {
    console.log(`Testing model: ${m}...`);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
      const payload = {
        contents: [
          {
            parts: [
              { text: 'Generate an ultra-modern futuristic 3D marketing poster with glowing neon glass UI elements for a developer tool' }
            ]
          }
        ]
      };
      const res = await axios.post(url, payload, { timeout: 25000 });
      console.log(`SUCCESS with ${m}! Response candidates:`);
      const parts = res.data.candidates?.[0]?.content?.parts || [];
      for (const p of parts) {
        if (p.inlineData) {
          console.log(`Found inlineData! mimeType: ${p.inlineData.mimeType}, base64 length: ${p.inlineData.data?.length}`);
          fs.writeFileSync(`test-gemini-${m}.png`, Buffer.from(p.inlineData.data, 'base64'));
          return true;
        } else if (p.text) {
          console.log(`Text response snippet: ${p.text.slice(0, 100)}`);
        }
      }
    } catch (e) {
      console.log(`Failed ${m}:`, e.response?.status, e.response?.data?.error?.message || e.message);
    }
  }
}

testGeminiImage();
