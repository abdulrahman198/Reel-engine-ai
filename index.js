import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();
const app = express();
const port = process.env.PORT || 8787;
const openai = process.env.OPENAI_API_KEY ? new OpenAI({apiKey: process.env.OPENAI_API_KEY}) : null;
app.use(cors());
app.use(express.json({limit:'10mb'}));

app.get('/api/health', (_,res)=>res.json({ok:true,version:'0.4.0',providers:{ai:!!openai,voice:!!process.env.ELEVENLABS_API_KEY}}));

const languageName = {ar:'Arabic',de:'German',en:'English'};
function fallback(topic,language,duration,style){
  const count=duration>=60?6:duration>=45?5:4;
  const script=language==='ar'?`تخيّل: ${topic}.\n\nنبدأ بلقطة قوية، ثم نكشف السياق خطوة بخطوة، وننهي بصورة ورسالة واضحة تبقى في الذاكرة.`:language==='de'?`Stell dir vor: ${topic}.\n\nWir beginnen mit einem starken Bild, geben dann Schritt für Schritt Kontext und enden mit einer klaren, einprägsamen Aussage.`:`Imagine this: ${topic}.\n\nStart with a striking image, reveal context step by step, and finish on one clear memorable idea.`;
  return {script,scenes:Array.from({length:count},(_,i)=>({title:['Hook','Context','Detail','Tension','Payoff','Closing'][i],start:Math.round(i*duration/count),end:Math.round((i+1)*duration/count),voiceover:'',visualPrompt:`${style} vertical 9:16 cinematic scene about ${topic}, beat ${i+1}, realistic lighting, strong composition, no baked-in text`,onScreenText:''}))};
}

app.post('/api/generate', async (req,res)=>{
  const {topic,language='en',duration=30,style='Cinematic documentary'}=req.body||{};
  if(!topic?.trim()) return res.status(400).json({error:'topic_required'});
  if(!openai) return res.json({...fallback(topic,language,duration,style),mode:'demo',warning:'OPENAI_API_KEY is not configured'});
  try{
    const prompt=`Create a production plan for a ${duration}-second vertical Reel/TikTok.\nTopic: ${topic}\nLanguage: ${languageName[language]||'English'}\nStyle: ${style}\nReturn ONLY valid JSON with this exact shape: {"script":"full voiceover script","scenes":[{"title":"short beat title","start":0,"end":5,"voiceover":"spoken line for this beat","visualPrompt":"detailed cinematic generation prompt, no text baked into image","onScreenText":"short optional caption"}]}. Use ${duration>=60?6:duration>=45?5:4} scenes. Keep facts cautious; do not invent specific claims when the topic needs research. Make the opening immediately compelling and the final beat memorable.`;
    const response=await openai.responses.create({model:process.env.OPENAI_MODEL||'gpt-5.6-luna',input:prompt});
    const raw=response.output_text?.trim()||'';
    const cleaned=raw.replace(/^```json\s*/i,'').replace(/```$/,'').trim();
    const data=JSON.parse(cleaned);
    if(!data.script||!Array.isArray(data.scenes)) throw new Error('invalid_model_payload');
    res.json({...data,mode:'ai'});
  }catch(error){
    console.error(error);
    res.status(502).json({error:'generation_failed',detail:error.message});
  }
});

app.post('/api/project',(req,res)=>{const{topic,language='en',duration=30}=req.body||{};if(!topic)return res.status(400).json({error:'topic_required'});res.json({topic,language,duration,status:'planned',next:['script','scenes','voice','captions','media','render','qa']})});
app.listen(port,()=>console.log(`Reel Engine API v0.4 ready on :${port}`));
