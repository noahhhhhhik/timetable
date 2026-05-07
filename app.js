// app.js
class VoiceDayPlanner {
    constructor() {
        this.recordBtn = document.getElementById('recordBtn');
        this.recordingStatus = document.getElementById('recordingStatus');
        this.transcript = document.getElementById('transcript');
        this.loading = document.getElementById('loading');
        this.timetable = document.getElementById('timetable');
        this.eventsList = document.getElementById('eventsList');
        this.dateDisplay = document.getElementById('dateDisplay');
        this.error = document.getElementById('error');
        this.editBtn = document.getElementById('editBtn');
        this.newPlanBtn = document.getElementById('newPlanBtn');
        
        this.recognition = null;
        this.isRecording = false;
        this.currentTranscript = '';
        this.events = [];
        this.isEditMode = false;
        
        this.init();
    }
    
    init() {
        // Web Speech API initialisieren
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            this.recognition.lang = 'de-DE';
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            
            this.recognition.onresult = (event) => {
                let finalTranscript = '';
                let interimTranscript = '';
                
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript;
                    } else {
                        interimTranscript += transcript;
                    }
                }
                
                this.currentTranscript += finalTranscript;
                this.transcript.textContent = this.currentTranscript + interimTranscript;
            };
            
            this.recognition.onerror = (event) => {
                console.error('Spracherkennungsfehler:', event.error);
                if (event.error !== 'no-speech') {
                    this.showError('Fehler bei der Spracherkennung: ' + event.error);
                }
            };
        } else {
            this.showError('Dein Browser unterstützt keine Spracherkennung. Bitte Chrome, Edge oder Safari verwenden.');
            this.recordBtn.disabled = true;
        }
        
        // Event Listener
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Push-to-Talk für Maus und Touch
        const startRecording = (e) => {
            e.preventDefault();
            if (!this.isRecording && this.recognition) {
                this.startRecording();
            }
        };
        
        const stopRecording = (e) => {
            e.preventDefault();
            if (this.isRecording) {
                this.stopRecording();
            }
        };
        
        this.recordBtn.addEventListener('mousedown', startRecording);
        this.recordBtn.addEventListener('mouseup', stopRecording);
        this.recordBtn.addEventListener('mouseleave', stopRecording);
        
        // Touch Events für Handy
        this.recordBtn.addEventListener('touchstart', startRecording, { passive: false });
        this.recordBtn.addEventListener('touchend', stopRecording, { passive: false });
        
        this.editBtn.addEventListener('click', () => this.toggleEditMode());
        this.newPlanBtn.addEventListener('click', () => this.reset());
    }
    
    startRecording() {
        this.isRecording = true;
        this.currentTranscript = '';
        this.recordBtn.classList.add('recording');
        this.recordingStatus.classList.remove('hidden');
        this.transcript.classList.remove('hidden');
        this.timetable.classList.add('hidden');
        this.error.classList.add('hidden');
        
        try {
            this.recognition.start();
        } catch (e) {
            // Wenn bereits gestartet, ignorieren
        }
    }
    
    stopRecording() {
        this.isRecording = false;
        this.recordBtn.classList.remove('recording');
        this.recordingStatus.classList.add('hidden');
        
        try {
            this.recognition.stop();
        } catch (e) {
            // Ignorieren
        }
        
        // Kurze Verzögerung, damit letzte Ergebnisse verarbeitet werden
        setTimeout(() => {
            if (this.currentTranscript.trim()) {
                this.analyzeTranscript();
            }
        }, 500);
    }
    
    async analyzeTranscript() {
        this.loading.classList.remove('hidden');
        this.transcript.classList.add('hidden');
        
        try {
            // Hier rufen wir die Vercel API auf
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: this.currentTranscript
                })
            });
            
            if (!response.ok) {
                throw new Error('API-Fehler: ' + response.status);
            }
            
            const data = await response.json();
            this.events = data.events;
            this.renderTimetable(data.targetDate, data.dayLabel);
            
        } catch (error) {
            console.error('Fehler:', error);
            // Fallback: Lokale Analyse wenn API nicht erreichbar
            this.localAnalyze();
        } finally {
            this.loading.classList.add('hidden');
        }
    }
    
    // Lokale Fallback-Analyse (wenn API nicht verfügbar)
    localAnalyze() {
        const text = this.currentTranscript.toLowerCase();
        let targetDate = new Date();
        let dayLabel = 'Heute';
        
        // Heute/Morgen erkennen
        if (text.includes('morgen')) {
            targetDate = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);
            dayLabel = 'Morgen';
        }
        
        const events = this.parseEvents(text);
        this.events = events;
        this.renderTimetable(targetDate, dayLabel);
    }
    
    parseEvents(text) {
        const events = [];
        const timeRegex = /(\d{1,2})[.:](\d{2})|(\d{1,2})\s*uhr/gi;
        const lines = text.split(/[,.]/);
        
        let lastTime = null;
        
        lines.forEach(line => {
            const times = [];
            let match;
            const regex = /(\d{1,2})[.:](\d{2})/g;
            while ((match = regex.exec(line)) !== null) {
                times.push(`${match[1].padStart(2, '0')}:${match[2]}`);
            }
            
            if (times.length > 0) {
                const activity = line.replace(/(\d{1,2})[.:](\d{2})/g, '').replace(/bis|um|uhr/gi, '').trim();
                
                if (times.length === 2) {
                    // Von-Bis Angabe
                    const start = times[0];
                    const end = times[1];
                    const duration = this.calculateDuration(start, end);
                    events.push({ time: start, endTime: end, duration, activity });
                    lastTime = end;
                } else {
                    // Nur Startzeit
                    const start = times[0];
                    const end = this.addHour(start);
                    events.push({ time: start, endTime: end, duration: '1 Std', activity });
                    lastTime = end;
                }
            }
        });
        
        return events.sort((a, b) => a.time.localeCompare(b.time));
    }
    
    calculateDuration(start, end) {
        const [h1, m1] = start.split(':').map(Number);
        const [h2, m2] = end.split(':').map(Number);
        let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
        if (diff < 0) diff += 24 * 60;
        
        const hours = Math.floor(diff / 60);
        const mins = diff % 60;
        
        if (hours === 0) return `${mins} Min`;
        if (mins === 0) return `${hours} Std`;
        return `${hours}:${mins.toString().padStart(2, '0')} Std`;
    }
    
    addHour(time) {
        const [h, m] = time.split(':').map(Number);
        const newH = (h + 1) % 24;
        return `${newH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }
    
    renderTimetable(date, dayLabel) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        this.dateDisplay.textContent = `${dayLabel}, ${date.toLocaleDateString('de-DE', options)}`;
        
        this.eventsList.innerHTML = '';
        
        this.events.forEach((event, index) => {
            const card = document.createElement('div');
            card.className = 'event-card';
            card.draggable = true;
            card.dataset.index = index;
            
            card.innerHTML = `
                <div class="event-time">${event.time}${event.endTime ? ` - ${event.endTime}` : ''}</div>
                <div class="event-activity">${event.activity}</div>
                <div class="event-duration">${event.duration}</div>
                <div class="event-actions">
                    <button onclick="planner.deleteEvent(${index})">🗑️</button>
                </div>
            `;
            
            // Drag & Drop Events
            card.addEventListener('dragstart', (e) => this.handleDragStart(e));
            card.addEventListener('dragover', (e) => this.handleDragOver(e));
            card.addEventListener('drop', (e) => this.handleDrop(e));
            card.addEventListener('dragend', (e) => this.handleDragEnd(e));
            
            this.eventsList.appendChild(card);
        });
        
        this.timetable.classList.remove('hidden');
    }
    
    // Drag & Drop Handlers
    handleDragStart(e) {
        e.target.classList.add('dragging');
        e.dataTransfer.setData('text/plain', e.target.dataset.index);
    }
    
    handleDragOver(e) {
        e.preventDefault();
        const afterElement = this.getDragAfterElement(this.eventsList, e.clientY);
        const draggable = document.querySelector('.dragging');
        if (afterElement == null) {
            this.eventsList.appendChild(draggable);
        } else {
            this.eventsList.insertBefore(draggable, afterElement);
        }
    }
    
    handleDrop(e) {
        e.preventDefault();
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
        const cards = [...this.eventsList.querySelectorAll('.event-card')];
        const toIndex = cards.indexOf(document.querySelector('.dragging'));
        
        // Array neu ordnen
        const [moved] = this.events.splice(fromIndex, 1);
        this.events.splice(toIndex, 0, moved);
        
        // Neu rendern mit aktualisierten Zeiten
        this.updateTimesAfterReorder();
    }
    
    handleDragEnd(e) {
        e.target.classList.remove('dragging');
    }
    
    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.event-card:not(.dragging)')];
        
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
    
    updateTimesAfterReorder() {
        // Hier könnte man die Zeiten neu berechnen, wenn gewünscht
        // Aktuell behalten wir die ursprünglichen Zeiten bei
        this.renderTimetable(new Date(), this.dateDisplay.textContent.split(', ')[0]);
    }
    
    toggleEditMode() {
        this.isEditMode = !this.isEditMode;
        this.timetable.classList.toggle('edit-mode');
        
        if (this.isEditMode) {
            this.editBtn.textContent = 'Speichern';
            this.makeEventsEditable();
        } else {
            this.editBtn.textContent = 'Bearbeiten';
            this.saveEdits();
        }
    }
    
    makeEventsEditable() {
        const cards = this.eventsList.querySelectorAll('.event-card');
        cards.forEach((card, index) => {
            const timeDiv = card.querySelector('.event-time');
            const activityDiv = card.querySelector('.event-activity');
            
            const timeText = timeDiv.textContent.split(' - ')[0];
            const activityText = activityDiv.textContent;
            
            timeDiv.innerHTML = `<input type="time" class="event-time-input" value="${timeText}">`;
            activityDiv.innerHTML = `<input type="text" class="event-activity-input" value="${activityText}">`;
        });
    }
    
    saveEdits() {
        const cards = this.eventsList.querySelectorAll('.event-card');
        cards.forEach((card, index) => {
            const timeInput = card.querySelector('.event-time-input');
            const activityInput = card.querySelector('.event-activity-input');
            
            if (timeInput && activityInput) {
                this.events[index].time = timeInput.value;
                this.events[index].activity = activityInput.value;
            }
        });
        
        this.renderTimetable(new Date(), this.dateDisplay.textContent.split(', ')[0]);
    }
    
    deleteEvent(index) {
        this.events.splice(index, 1);
        this.renderTimetable(new Date(), this.dateDisplay.textContent.split(', ')[0]);
    }
    
    reset() {
        this.currentTranscript = '';
        this.events = [];
        this.transcript.textContent = '';
        this.timetable.classList.add('hidden');
        this.transcript.classList.add('hidden');
        this.isEditMode = false;
        this.editBtn.textContent = 'Bearbeiten';
    }
    
    showError(message) {
        this.error.textContent = message;
        this.error.classList.remove('hidden');
    }
}

// Initialisierung
const planner = new VoiceDayPlanner();
