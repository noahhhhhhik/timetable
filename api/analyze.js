// api/analyze.js (Vercel Serverless Function)
// Diese Datei kommt in den Ordner "api/" und wird von Vercel automatisch als API-Route erkannt

export default async function handler(req, res) {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const { text } = req.body;
    
    if (!text) {
        return res.status(400).json({ error: 'Text ist erforderlich' });
    }
    
    try {
        // Hier verwenden wir OpenAI GPT-4o-mini für die Analyse
        // Du brauchst einen OPENAI_API_KEY in den Vercel Environment Variables
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: `Du bist ein Tagesplaner-Assistent. Analysiere den gesprochenen Text und extrahiere Aktivitäten mit Uhrzeiten.
                        
                        WICHTIGE REGELN:
                        - Wenn der Benutzer "heute" sagt, verwende das heutige Datum: ${new Date().toISOString().split('T')[0]}
                        - Wenn der Benutzer "morgen" sagt, verwende das morgige Datum
                        - Wenn nur eine Startzeit genannt wird (z.B. "um 8 Uhr"), setze die Dauer auf 1 Stunde
                        - Wenn ein Zeitraum genannt wird (z.B. "11 bis 14 Uhr"), berechne die Dauer
                        - Aktivitäten ohne Zeitangabe sollen intelligent einsortiert werden (zwischen anderen Aktivitäten oder am Ende)
                        - Gib die Zeiten immer im Format HH:MM an
                        
                        Antworte NUR mit einem JSON-Objekt im folgenden Format:
                        {
                            "targetDate": "YYYY-MM-DD",
                            "dayLabel": "Heute" oder "Morgen",
                            "events": [
                                {
                                    "time": "08:00",
                                    "endTime": "09:00",
                                    "duration": "1 Std",
                                    "activity": "Aufstehen"
                                }
                            ]
                        }`
                    },
                    {
                        role: 'user',
                        content: text
                    }
                ],
                temperature: 0.3
            })
        });
        
        if (!response.ok) {
            throw new Error('OpenAI API Fehler');
        }
        
        const aiResponse = await response.json();
        const content = aiResponse.choices[0].message.content;
        
        // JSON aus der Antwort extrahieren
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('Kein gültiges JSON in der Antwort');
        }
        
        const plan = JSON.parse(jsonMatch[0]);
        
        // Datum-Objekt hinzufügen
        plan.targetDate = new Date(plan.targetDate);
        
        res.status(200).json(plan);
        
    } catch (error) {
        console.error('Fehler:', error);
        
        // Fallback: Lokale Analyse
        const fallback = localAnalyzeFallback(text);
        res.status(200).json(fallback);
    }
}

function localAnalyzeFallback(text) {
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    
    const isTomorrow = text.toLowerCase().includes('morgen');
    const targetDate = isTomorrow ? tomorrow : today;
    const dayLabel = isTomorrow ? 'Morgen' : 'Heute';
    
    // Einfache Regex-basierte Extraktion
    const events = [];
    const lines = text.split(/[,.;]/);
    
    const timeRegex = /(\d{1,2})[.:](\d{2})\s*(?:uhr)?/gi;
    
    lines.forEach(line => {
        const matches = [...line.matchAll(/(\d{1,2})[.:](\d{2})/g)];
        
        if (matches.length > 0) {
            const times = matches.map(m => `${m[1].padStart(2, '0')}:${m[2]}`);
            const activity = line.replace(/(\d{1,2})[.:](\d{2})\s*(?:uhr)?/gi, '')
                                .replace(/bis|um|von|bis|heute|morgen/gi, '')
                                .trim();
            
            if (times.length === 2) {
                const start = times[0];
                const end = times[1];
                const durationMin = calculateDurationMinutes(start, end);
                const duration = formatDuration(durationMin);
                events.push({ time: start, endTime: end, duration, activity });
            } else {
                const start = times[0];
                const end = addMinutesToTime(start, 60);
                events.push({ time: start, endTime: end, duration: '1 Std', activity });
            }
        }
    });
    
    return {
        targetDate,
        dayLabel,
        events: events.sort((a, b) => a.time.localeCompare(b.time))
    };
}

function calculateDurationMinutes(start, end) {
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diff < 0) diff += 24 * 60;
    return diff;
}

function formatDuration(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins} Min`;
    if (mins === 0) return `${hours} Std`;
    return `${hours}:${mins.toString().padStart(2, '0')} Std`;
}

function addMinutesToTime(time, minutesToAdd) {
    const [h, m] = time.split(':').map(Number);
    const totalMinutes = h * 60 + m + minutesToAdd;
    const newH = Math.floor(totalMinutes / 60) % 24;
    const newM = totalMinutes % 60;
    return `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`;
}
