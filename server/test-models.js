import axios from 'axios';

async function main() {
  const apiKey = process.env.GEMINI_API_KEY || '';
  try {
    const res = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    console.log('Available models:');
    const models = res.data.models || [];
    const names = models.map(m => ({ name: m.name, supportedGenerationMethods: m.supportedGenerationMethods }));
    console.log(JSON.stringify(names.filter(m => m.name.includes('imagen') || m.name.includes('flash') || m.name.includes('image')), null, 2));
  } catch (e) {
    console.error('List models error:', e.response?.data || e.message);
  }
}

main();
