import OpenAI from 'openai';
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'missing' });
export async function analyzeCandidate(job:any, app:any, resume:any){
 if(!process.env.OPENAI_API_KEY) return {score:0,summary:'OPENAI_API_KEY не задан. Анализ не выполнен.',strengths:[],risks:['Нет API ключа'],missing_info:[],interview_questions:[],recommended_status:'not_enough_data'};
 const prompt = `Ты AI-помощник для малого бизнеса. Оцени кандидата только по профессиональным факторам. Не используй пол, возраст, национальность, фото, здоровье, семейное положение и другие защищенные признаки. Верни строго JSON с полями score, summary, strengths, risks, missing_info, interview_questions, recommended_status.

Вакансия: ${job.title}
${job.description}

Сопроводительное: ${app.cover_letter||''}

Резюме: ${resume?.raw_text||''}`;
 const r = await client.chat.completions.create({model:'gpt-4o-mini',messages:[{role:'user',content:prompt}],response_format:{type:'json_object'}});
 return JSON.parse(r.choices[0]?.message?.content || '{}');
}
