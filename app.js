let ALL_DATA = null;
let currentUnitId = "";
let currentVocabList = [];
let currentGamePhase = 1; 
let currentIndex = 0;
let totalTasks = 0;
let completedTasks = 0;

let recognition = null;
let micTimeoutTimer;
let isFallbackActive = false;
let isListening = false;
let attemptCounter = 0;
const MAX_ATTEMPTS = 3;

window.addEventListener('DOMContentLoaded', () => {
    const jsonPath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/')) + '/data.json';
    fetch(jsonPath)
        .then(response => response.json())
        .then(data => {
            ALL_DATA = data;
            renderUnitSelector();
        })
        .catch(err => console.error("Lỗi nạp tệp: ", err));
});

function renderUnitSelector() {
    const grid = document.getElementById('unit-grid');
    if (!grid) return;
    grid.innerHTML = "";
    for (let i = 1; i <= 9; i++) {
        let uKey = `unit${i}`;
        if (ALL_DATA && ALL_DATA[uKey]) {
            let btn = document.createElement('div');
            btn.className = "unit-card";
            btn.innerHTML = `<span style="color:#ff6b6b; font-weight:700;">Unit ${i}</span><br><span style="font-size:14px;color:#7f8c8d;">${ALL_DATA[uKey].title}</span>`;
            btn.onclick = () => selectUnit(uKey);
            grid.appendChild(btn);
        }
    }
}

function selectUnit(unitId) {
    currentUnitId = unitId;
    let unitData = ALL_DATA[currentUnitId];
    currentVocabList = [...unitData.vocabulary].sort(() => Math.random() - 0.5);
    currentGamePhase = 1; currentIndex = 0; completedTasks = 0;
    totalTasks = currentVocabList.length * 2 + unitData.grammar.length + unitData.dialogs.length;
    initSpeechAPI();
    document.getElementById('control-area').style.display = 'flex';
    updateProgressBar();
    loadTask();
}

function changeScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) targetScreen.classList.add('active');
}

function updateProgressBar() {
    let percentage = (completedTasks / totalTasks) * 100;
    const bar = document.getElementById('progress-bar');
    if (bar) bar.style.width = percentage + '%';
}

function loadTask() {
    isFallbackActive = false;
    attemptCounter = 0;
    if (document.getElementById('global-skip-btn')) document.getElementById('global-skip-btn').classList.remove('highlighted');
    if (document.getElementById('speech-live-text')) document.getElementById('speech-live-text').innerText = "";
    setMicListeningState(false);
    isListening = false;
    
    if(document.getElementById('avatar-beth')) document.getElementById('avatar-beth').classList.remove('speaking');
    if(document.getElementById('avatar-van')) document.getElementById('avatar-van').classList.remove('speaking');

    let unitData = ALL_DATA[currentUnitId];

    if (currentGamePhase === 1) {
        if (currentIndex >= currentVocabList.length) {
            currentGamePhase = 2; currentIndex = 0;
        } else {
            renderQuizLayout(currentVocabList[currentIndex], 'word');
            return;
        }
    }

    if (currentGamePhase === 2) {
        if (currentIndex >= currentVocabList.length) {
            currentGamePhase = 3; currentIndex = 0;
        } else {
            renderSpeakLayout(currentVocabList[currentIndex], 'word');
            return;
        }
    }

    if (currentGamePhase === 3) {
        if (currentIndex >= unitData.grammar.length) {
            currentGamePhase = 4; currentIndex = 0;
        } else {
            renderSpeakLayout(unitData.grammar[currentIndex], 'grammar');
            return;
        }
    }

    if (currentGamePhase === 4) {
        if (currentIndex >= unitData.dialogs.length) {
            changeScreen('screen-result');
            playLocalAudio("assets/audio/khen_hoanthanh.mp3");
            document.getElementById('control-area').style.display = 'none';
            return;
        } else {
            renderDialogLayout(unitData.dialogs[currentIndex]);
            return;
        }
    }
}

// ĐÃ SỬA: KHẮC PHỤC LỖI NHẤP NHÁY ẢNH VÒNG 1 - ÉP SỬ DỤNG PHƯƠNG ÁN CHỐNG VỠ HÌNH TRỰC TUYẾN TRÊN SERVER GITHUB PAGES
function renderQuizLayout(item, type) {
    changeScreen('screen-quiz');
    const quizImg = document.getElementById('quiz-img');
    if (quizImg) {
        // Sử dụng ảnh nền màu thông minh trực tuyến cực nhẹ để không bao giờ bị nháy hay vỡ hình
        quizImg.src = `https://placehold.co/200x160/4ecdc4/white?text=${type === 'word' ? item.word : 'Grammar'}`;
        quizImg.style.display = 'block';
    }
    document.getElementById('game-hint').innerText = "Nghĩa tiếng Việt: " + item.meaning;

    let targetText = type === 'word' ? item.word : item.sentence;
    let options = [targetText, ...item.distractors];
    options.sort(() => Math.random() - 0.5);

    let container = document.getElementById('quiz-options-container');
    if (container) {
        container.innerHTML = "";
        options.forEach(opt => {
            let btn = document.createElement('button');
            btn.className = "option-btn";
            btn.innerText = opt;
            btn.onclick = () => checkQuizAnswer(btn, opt, targetText);
            container.appendChild(btn);
        });
    }
    speakCurrentTarget();
}

function renderSpeakLayout(item, type) {
    changeScreen('screen-speak');
    document.getElementById('speak-vocab-area').style.display = 'block';
    document.getElementById('speak-dialog-area').style.display = 'none';
    
    const speakImg = document.getElementById('speak-img');
    const speakWord = document.getElementById('speak-word');
    
    if (type === 'word') {
        document.getElementById('speak-title').innerText = "Vòng 2: Bé Tập Phát Âm 🗣️";
        if(speakWord) speakWord.innerText = item.word;
        if(speakImg) { 
            speakImg.src = `https://placehold.co/200x160/ff6b6b/white?text=${item.word}`;
            speakImg.style.display = 'block'; 
        }
        document.getElementById('game-hint').innerText = "Nghĩa: " + item.meaning;
    } else {
        document.getElementById('speak-title').innerText = "Vòng 2.5: Luyện Câu Ngữ Pháp 🧩";
        if(speakWord) speakWord.innerText = item.sentence;
        if(speakImg) { 
            speakImg.src = `https://placehold.co/200x160/1dd1a1/white?text=Grammar`;
            speakImg.style.display = 'block'; 
        }
        document.getElementById('game-hint').innerText = item.hint_vn;
    }
    speakCurrentTarget();
}

// ĐÃ SỬA: ĐỐI THOẠI HAI BÊN TỰ ĐỘNG PHÁT LIÊN TIẾP (BETH NÓI XONG -> MÁY TỰ PHÁT ÂM MẪU CỦA VÂN)
function renderDialogLayout(item) {
    changeScreen('screen-speak');
    document.getElementById('speak-vocab-area').style.display = 'none';
    document.getElementById('speak-dialog-area').style.display = 'flex';
    document.getElementById('speak-title').innerText = "Vòng 3: Đóng Vai Đối Thoại 🎭";
    
    document.getElementById('bubble-machine').innerText = "💬 Beth: " + item.speaker_machine;
    document.getElementById('bubble-user').innerText = "👉 Con hãy đọc: " + item.suggested_user;
    document.getElementById('game-hint').innerText = "Dịch nghĩa: " + item.hint_vn;

    if(document.getElementById('avatar-beth')) document.getElementById('avatar-beth').classList.add('speaking');
    
    // Luồng tự động thông minh: Phát âm thanh câu hỏi của Beth trước
    const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
    let audioBeth = new Audio(`${baseUrl}/assets/audio/${item.id}_m.mp3`);
    
    audioBeth.play().then(() => {
        audioBeth.onended = () => {
            // Khi Beth nói xong, tắt hiệu ứng nhảy của Beth, chuyển sang bật nhảy hiệu ứng của Vân và phát âm mẫu của Vân
            if(document.getElementById('avatar-beth')) document.getElementById('avatar-beth').classList.remove('speaking');
            if(document.getElementById('avatar-van')) document.getElementById('avatar-van').classList.add('speaking');
            
            let audioVanSample = new Audio(`${baseUrl}/assets/audio/${item.id}_u.mp3`);
            audioVanSample.play().then(() => {
                audioVanSample.onended = () => {
                    if(document.getElementById('avatar-van')) document.getElementById('avatar-van').classList.remove('speaking');
                };
            });
        };
    }).catch(() => {
        speakCurrentTarget();
    });
}

function checkQuizAnswer(btn, selected, correct) {
    if (selected === correct) {
        btn.classList.add('correct');
        playLocalAudio("assets/audio/khen_dung.mp3");
        setTimeout(() => { completedTasks++; currentIndex++; updateProgressBar(); loadTask(); }, 1200);
    } else {
        btn.classList.add('wrong');
        playLocalAudio("assets/audio/khen_sai.mp3");
        setTimeout(() => { if(btn) btn.className = "option-btn"; }, 1200);
    }
}

function playLocalAudio(filePath) {
    const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
    const absolutePath = filePath.startsWith('http') ? filePath : `${baseUrl}/${filePath}`;
    let audio = new Audio(absolutePath);
    audio.play().catch(() => {});
}

function getSimilarityScore(s1, s2) {
    const clean = (str) => str.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "").trim();
    const strA = clean(s1); const strB = clean(s2);
    if (strA === strB) return 1.0;
    const wordsA = strA.split(" "); const wordsB = strB.split(" ");
    
    if (wordsA.length === 1 || wordsB.length === 1) {
        let track = Array(strB.length + 1).fill(null).map(() => Array(strA.length + 1).fill(null));
        for (let i = 0; i <= strA.length; i++) track[0][i] = i;
        for (let j = 0; j <= strB.length; j++) track[j][0] = j;
        for (let j = 1; j <= strB.length; j++) {
            for (let i = 1; i <= strA.length; i++) {
                let ind = strA[i - 1] === strB[j - 1] ? 0 : 1;
                track[j][i] = Math.min(track[j][i - 1] + 1, track[j - 1][i] + 1, track[j - 1][i - 1] + ind);
            }
        }
        return (Math.max(strA.length, strB.length) - track[strB.length][strA.length]) / Math.max(strA.length, strB.length);
    } else {
        const intersection = wordsA.filter(w => wordsB.includes(w));
        return (2.0 * intersection.length) / (wordsA.length + wordsB.length);
    }
}

function initSpeechAPI() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
        clearTimeout(micTimeoutTimer);
        isListening = false; setMicListeningState(false);
        const result = event.results[0][0].transcript;
        const liveText = document.getElementById('speech-live-text');
        if (liveText) liveText.innerText = "Máy nghe được: \"" + result + "\"";
        evaluateSpeech(result);
    };

    recognition.onerror = () => {
        clearTimeout(micTimeoutTimer); isListening = false; setMicListeningState(false);
        activateFallbackQuiz();
    };
    recognition.onend = () => { isListening = false; setMicListeningState(false); };
}

function toggleListening() {
    if (isFallbackActive || !recognition) return;
    if (isListening) {
        isListening = false; recognition.stop(); clearTimeout(micTimeoutTimer); setMicListeningState(false);
        if(document.getElementById('avatar-van')) document.getElementById('avatar-van').classList.remove('speaking');
    } else {
        isListening = true;
        try {
            recognition.start(); setMicListeningState(true);
            if(document.getElementById('avatar-van')) document.getElementById('avatar-van').classList.add('speaking');
            
            const liveText = document.getElementById('speech-live-text');
            if (liveText) liveText.innerText = "🎙️ Đang lắng nghe... Con nói đi nào!";
            
            micTimeoutTimer = setTimeout(() => {
                if (isListening) { isListening = false; recognition.stop(); activateFallbackQuiz(); }
            }, 8000);
        } catch(e) { activateFallbackQuiz(); }
    }
}

function setMicListeningState(state) {
    const btn = document.getElementById('mic-button');
    if (btn) { if (state) btn.classList.add('listening'); else btn.classList.remove('listening'); }
}

function evaluateSpeech(spokenText) {
    let unitData = ALL_DATA[currentUnitId];
    let targetText = "";
    let threshold = 0.55;

    if (currentGamePhase === 2) targetText = currentVocabList[currentIndex].word;
    else if (currentGamePhase === 3) targetText = unitData.grammar[currentIndex].sentence;
    else if (currentGamePhase === 4) {
        let isMatch = unitData.dialogs[currentIndex].accept_keywords.some(key => getSimilarityScore(spokenText, key) >= threshold);
        if (isMatch) processSpeechSuccess(); else processSpeechFail();
        return;
    }

    if (getSimilarityScore(spokenText, targetText) >= threshold) processSpeechSuccess(); else processSpeechFail();
}

function processSpeechSuccess() {
    if(document.getElementById('avatar-van')) document.getElementById('avatar-van').classList.remove('speaking');
    playLocalAudio("assets/audio/khen_dung.mp3");
    setTimeout(() => { completedTasks++; currentIndex++; updateProgressBar(); loadTask(); }, 1500);
}

function processSpeechFail() {
    if(document.getElementById('avatar-van')) document.getElementById('avatar-van').classList.remove('speaking');
    attemptCounter++;
    if (attemptCounter >= MAX_ATTEMPTS) {
        const skipBtn = document.getElementById('global-skip-btn');
        if (skipBtn) skipBtn.classList.add('highlighted');
        activateFallbackQuiz();
    } else {
        playLocalAudio("assets/audio/khen_sai.mp3");
        const liveText = document.getElementById('speech-live-text');
        if (liveText) liveText.innerText += ` (Lần ${attemptCounter}/${MAX_ATTEMPTS})`;
    }
}

function activateFallbackQuiz() {
    if (isFallbackActive) return;
    isFallbackActive = true;
    playLocalAudio("assets/audio/khen_sai.mp3");
    
    setTimeout(() => {
        let unitData = ALL_DATA[currentUnitId];
        if (currentGamePhase === 2) renderQuizLayout(currentVocabList[currentIndex], 'word');
        else if (currentGamePhase === 3) renderQuizLayout(unitData.grammar[currentIndex], 'sentence');
        else if (currentGamePhase === 4) { completedTasks++; currentIndex++; updateProgressBar(); loadTask(); }
    }, 1000);
}

function speakCurrentTarget() {
    let unitData = ALL_DATA[currentUnitId];
    const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
    let fileToPlay = "";
    if (currentGamePhase === 1 || currentGamePhase === 2) fileToPlay = `${baseUrl}/assets/audio/${currentVocabList[currentIndex].id}.mp3`;
    else if (currentGamePhase === 3) fileToPlay = `${baseUrl}/assets/audio/${unitData.grammar[currentIndex].id}.mp3`;
    else if (currentGamePhase === 4) fileToPlay = `${baseUrl}/assets/audio/${unitData.dialogs[currentIndex].id}_m.mp3`;

    if(currentGamePhase === 4 && document.getElementById('avatar-beth')) {
        document.getElementById('avatar-beth').classList.add('speaking');
    }
    let audio = new Audio(fileToPlay);
    audio.play().catch(() => {});
}

function skipTask() {
    completedTasks++; currentIndex++; updateProgressBar(); loadTask();
}

function resetGame() {
    changeScreen('screen-welcome');
    document.getElementById('control-area').style.display = 'none';
}

