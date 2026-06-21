let ALL_DATA = null;
let currentUnitId = "";
let currentVocabList = [];
let currentGamePhase = 1; // 1: Trắc nghiệm Vocab, 15: Sắp xếp chữ (1.5), 2: Nói Vocab, 25: Điền khuyết câu (2.5), 3: Hội thoại (Vòng 3)
let currentIndex = 0;
let totalTasks = 0;
let completedTasks = 0;

let recognition = null;
let micTimeoutTimer;
let isFallbackActive = false;
let isListening = false;
let attemptCounter = 0;
const MAX_ATTEMPTS = 3;

// Biến bổ trợ riêng cho Vòng 1.5 Sắp xếp chữ cái
let spellingCurrentAnswer = [];
let spellingTargetWord = "";

window.addEventListener('DOMContentLoaded', () => {
    const jsonPath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/')) + '/data.json';
    
    fetch(jsonPath)
        .then(response => {
            if (!response.ok) throw new Error("Không thể tải file dữ liệu");
            return response.json();
        })
        .then(data => {
            ALL_DATA = data;
            renderUnitSelector();
        })
        .catch(err => {
            console.error("Lỗi nạp tệp data.json: ", err);
            document.getElementById('unit-grid').innerHTML = "<p style='color:red;'>Đang tải dữ liệu, anh vui lòng đợi chút nhé...</p>";
        });
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
    
    currentGamePhase = 1;
    currentIndex = 0;
    completedTasks = 0;
    
    // TÍNH TOÁN CHUẨN TỔNG SỐ NHIỆM VỤ CHO CẢ 5 VÒNG CHƠI KHÉP KÍN
    totalTasks = (currentVocabList.length * 3) + (unitData.grammar.length * 2) + unitData.dialogs.length;
    
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

// MẠCH ĐIỀU PHỐI VẬN HÀNH TUÂN THỦ CHẶT CHẼ 5 VÒNG CHƠI (1 -> 1.5 -> 2 -> 2.5 -> 3)
function loadTask() {
    isFallbackActive = false;
    attemptCounter = 0;
    
    const skipBtn = document.getElementById('global-skip-btn');
    if (skipBtn) skipBtn.classList.remove('highlighted');
    
    const liveText = document.getElementById('speech-live-text');
    if (liveText) liveText.innerText = "";
    
    setMicListeningState(false);
    isListening = false;
    
    if(document.getElementById('avatar-beth')) document.getElementById('avatar-beth').classList.remove('speaking');
    if(document.getElementById('avatar-van')) document.getElementById('avatar-van').classList.remove('speaking');

    let unitData = ALL_DATA[currentUnitId];

    // VÒNG 1: Trắc nghiệm hình ảnh nhận biết từ vựng
    if (currentGamePhase === 1) {
        if (currentIndex >= currentVocabList.length) {
            currentGamePhase = 15; currentIndex = 0; // Chuyển sang Vòng 1.5
        } else {
            renderQuizLayout(currentVocabList[currentIndex], 'word');
            return;
        }
    }

    // VÒNG 1.5: Thử thách sắp xếp chữ cái thành từ vựng đúng
    if (currentGamePhase === 15) {
        if (currentIndex >= currentVocabList.length) {
            currentGamePhase = 2; currentIndex = 0; // Chuyển sang Vòng 2
        } else {
            renderSpellingLayout(currentVocabList[currentIndex]);
            return;
        }
    }

    // VÒNG 2: Luyện phát âm Micro từ vựng đơn
    if (currentGamePhase === 2) {
        if (currentIndex >= currentVocabList.length) {
            currentGamePhase = 25; currentIndex = 0; // Chuyển sang Vòng 2.5
        } else {
            renderSpeakLayout(currentVocabList[currentIndex], 'word');
            return;
        }
    }

    // VÒNG 2.5: Trắc nghiệm điền khuyết cấu trúc câu Ngữ Pháp
    if (currentGamePhase === 25) {
        if (currentIndex >= unitData.grammar.length) {
            currentGamePhase = 26; currentIndex = 0; // Luồng phụ: Tập đọc câu Ngữ Pháp đầy đủ trước khi đóng vai
        } else {
            renderGrammarClozeLayout(unitData.grammar[currentIndex]);
            return;
        }
    }

    // LUỒNG PHỤ: Cho bé tập phát âm mẫu câu Ngữ Pháp (Hỗ trợ chuẩn bị bước vào Vòng 3 Hội thoại)
    if (currentGamePhase === 26) {
        if (currentIndex >= unitData.grammar.length) {
            currentGamePhase = 3; currentIndex = 0; // Chính thức bước vào Vòng 3 Hội thoại
        } else {
            renderSpeakLayout(unitData.grammar[currentIndex], 'grammar');
            return;
        }
    }

    // VÒNG 3: Đóng vai đối thoại tương tác hoạt họa 2 bên
    if (currentGamePhase === 3) {
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

function renderQuizLayout(item, type) {
    changeScreen('screen-quiz');
    document.getElementById('quiz-heading').innerText = "Vòng 1: Thử Tài Tinh Mắt 👀";
    document.getElementById('quiz-instruction').innerText = "Bé nhìn hình minh họa và bấm chọn từ tiếng Anh đúng nhất nhé!";
    if(document.getElementById('quiz-text-display')) document.getElementById('quiz-text-display').style.display = 'none';
    
    const quizImg = document.getElementById('quiz-img');
    if (quizImg) {
        quizImg.src = `assets/images/${item.id}.png`;
        quizImg.style.display = 'block';
    }
    document.getElementById('game-hint').innerText = "Nghĩa tiếng Việt: " + item.meaning;

    let targetText = item.word;
    let options = [targetText, ...item.distractors].sort(() => Math.random() - 0.5);

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

// KHỞI CHẠY CHUẨN LOGIC VÒNG 1.5: SẮP XẾP CHỮ CÁI TỪ VỰNG KHÔNG LỖI HIỂN THỊ
function renderSpellingLayout(item) {
    changeScreen('screen-spelling');
    spellingTargetWord = item.word.toLowerCase();
    spellingCurrentAnswer = [];
    
    const sImg = document.getElementById('spelling-img');
    if(sImg) {
        sImg.src = `assets/images/${item.id}.png`;
        sImg.style.display = 'block';
    }
    document.getElementById('game-hint').innerText = "Nghĩa: " + item.meaning;

    // Kết xuất các ô khuyết trống gạch chân
    const slotsContainer = document.getElementById('spelling-slots-container');
    slotsContainer.innerHTML = "";
    for(let i=0; i < spellingTargetWord.length; i++) {
        let slot = document.createElement('div');
        slot.className = "letter-slot";
        slot.id = `sp-slot-${i}`;
        slot.innerText = "_";
        slotsContainer.appendChild(slot);
    }

    // Xáo trộn chữ cái của từ vựng gốc làm kho nút bấm cho bé bấm chọn
    let lettersPool = spellingTargetWord.split("").sort(() => Math.random() - 0.5);
    const poolContainer = document.getElementById('spelling-pool-container');
    poolContainer.innerHTML = "";
    
    lettersPool.forEach((letter, idx) => {
        let btn = document.createElement('button');
        btn.className = "letter-btn";
        btn.innerText = letter.toUpperCase();
        btn.id = `let-btn-${idx}`;
        btn.onclick = () => selectSpellingLetter(btn, letter);
        poolContainer.appendChild(btn);
    });
}

function selectSpellingLetter(btn, letter) {
    if(spellingCurrentAnswer.length < spellingTargetWord.length) {
        btn.classList.add('used');
        spellingCurrentAnswer.push({ letter: letter, btnId: btn.id });
        
        let currentIdx = spellingCurrentAnswer.length - 1;
        document.getElementById(`sp-slot-${currentIdx}`).innerText = letter.toUpperCase();
        
        // Kiểm tra khi bé đã xếp đủ số lượng chữ cái
        if(spellingCurrentAnswer.length === spellingTargetWord.length) {
            let finalStr = spellingCurrentAnswer.map(x => x.letter).join("");
            if(finalStr === spellingTargetWord) {
                playLocalAudio("assets/audio/khen_dung.mp3");
                setTimeout(() => { completedTasks++; currentIndex++; updateProgressBar(); loadTask(); }, 1200);
            } else {
                playLocalAudio("assets/audio/khen_sai.mp3");
                setTimeout(() => { clearSpellingAnswer(); }, 1200);
            }
        }
    }
}

function clearSpellingAnswer() {
    spellingCurrentAnswer = [];
    for(let i=0; i < spellingTargetWord.length; i++) {
        const slot = document.getElementById(`sp-slot-${i}`);
        if(slot) slot.innerText = "_";
    }
    document.querySelectorAll('.letter-btn').forEach(btn => btn.classList.remove('used'));
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
        if(speakImg) { speakImg.src = `assets/images/${item.id}.png`; speakImg.style.display = 'block'; }
        document.getElementById('game-hint').innerText = "Nghĩa: " + item.meaning;
    } else {
        document.getElementById('speak-title').innerText = "Vòng 2.7: Luyện Câu Ngữ Pháp 🧩";
        if(speakWord) speakWord.innerText = item.sentence;
        if(speakImg) { speakImg.src = `assets/images/${item.id}.png`; speakImg.style.display = 'block'; }
        document.getElementById('game-hint').innerText = item.hint_vn;
    }
    speakCurrentTarget();
}

// KHỞI CHẠY CHUẨN LOGIC VÒNG 2.5: ĐỤC LỖ CÂU NGỮ PHÁP BIẾN THIÊN NGẪU NHIÊN
function renderGrammarClozeLayout(item) {
    changeScreen('screen-quiz');
    document.getElementById('quiz-heading').innerText = "Vòng 2.5: Điền Từ Vào Chỗ Trống 🧠";
    document.getElementById('quiz-instruction').innerText = "Bé hãy bấm chọn từ thích hợp để hoàn thành mẫu câu dưới đây nhé!";
    document.getElementById('quiz-img').style.display = 'none';
    
    let words = item.sentence.split(" ");
    let validIndices = [];
    words.forEach((w, index) => { if(w.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "").length > 2) validIndices.push(index); });
    let targetIndex = validIndices[Math.floor(Math.random() * validIndices.length)];
    
    let correctWord = words[targetIndex].replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "");
    words[targetIndex] = "_______";
    
    const textDisplay = document.getElementById('quiz-text-display');
    if(textDisplay) {
        textDisplay.innerText = words.join(" ");
        textDisplay.style.display = 'block';
    }
    
    document.getElementById('game-hint').innerText = "Dịch nghĩa câu câu: " + item.meaning;

    let options = [correctWord, ...item.distractors].sort(() => Math.random() - 0.5);
    let container = document.getElementById('quiz-options-container');
    if (container) {
        container.innerHTML = "";
        options.forEach(opt => {
            let cleanOpt = opt.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "");
            let btn = document.createElement('button');
            btn.className = "option-btn";
            btn.innerText = cleanOpt;
            btn.onclick = () => checkQuizAnswer(btn, cleanOpt, correctWord);
            container.appendChild(btn);
        });
    }
}

// VÒNG 3: ĐÓNG VAI HOẠT HỌA 2 BÊN VÀ TỰ ĐỘNG PHÁT THOẠI ĐÔI LIÊN TIẾP THÔNG MINH
function renderDialogLayout(item) {
    changeScreen('screen-speak');
    document.getElementById('speak-vocab-area').style.display = 'none';
    document.getElementById('speak-dialog-area').style.display = 'flex';
    document.getElementById('speak-title').innerText = "Vòng 3: Đóng Vai Đối Thoại 🎭";
    
    document.getElementById('bubble-machine').innerText = "💬 Beth: " + item.speaker_machine;
    document.getElementById('bubble-user').innerText = "👉 Con hãy đọc: " + item.suggested_user;
    document.getElementById('game-hint').innerText = "Dịch nghĩa: " + item.hint_vn;

    if(document.getElementById('avatar-beth')) document.getElementById('avatar-beth').classList.add('speaking');
    
    const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
    
    // Đồng bộ gọi chuẩn file audio_machine từ tệp dữ liệu JSON
    let audioBeth = new Audio(`${baseUrl}/${item.audio_machine}`);
    
    audioBeth.play().then(() => {
        audioBeth.onended = () => {
            if(document.getElementById('avatar-beth')) document.getElementById('avatar-beth').classList.remove('speaking');
            if(document.getElementById('avatar-van')) document.getElementById('avatar-van').classList.add('speaking');
            
            // Tự động nối tiếp phát file audio_user (lời mẫu của Vân) giúp con nghe lấy ngữ điệu chuẩn
            let audioVanSample = new Audio(`${baseUrl}/${item.audio_user}`);
            audioVanSample.play().then(() => {
                audioVanSample.onended = () => {
                    if(document.getElementById('avatar-van')) document.getElementById('avatar-van').classList.remove('speaking');
                };
            });
        };
    }).catch(() => { speakCurrentTarget(); });
}

function checkQuizAnswer(btn, selected, correct) {
    if (selected.toLowerCase() === correct.toLowerCase()) {
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
    if (!filePath) return;
    const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
    const absolutePath = filePath.startsWith('http') ? filePath : `${baseUrl}/${filePath}`;
    
    let audio = new Audio(absolutePath);
    audio.play().catch(e => console.log("Thiếu tệp tin âm thanh cục bộ: ", filePath));
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
        if (document.getElementById('speech-live-text')) document.getElementById('speech-live-text').innerText = "Máy nghe được: \"" + result + "\"";
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
    else if (currentGamePhase === 26) targetText = unitData.grammar[currentIndex].sentence;
    else if (currentGamePhase === 3) {
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

// BẢN VÁ KHÓA LỖI CRASH PHASE 4 (VÒNG 3) KHI MICRO BỊ TIMEOUT
function activateFallbackQuiz() {
    if (isFallbackActive) return;
    let unitData = ALL_DATA[currentUnitId];
    
    if (currentGamePhase === 3) {
        playLocalAudio("assets/audio/khen_sai.mp3");
        const skipBtn = document.getElementById('global-skip-btn');
        if (skipBtn) skipBtn.classList.add('highlighted');
        return;
    }
    
    isFallbackActive = true;
    playLocalAudio("assets/audio/khen_sai.mp3");
    
    setTimeout(() => {
        if (currentGamePhase === 2) renderQuizLayout(currentVocabList[currentIndex], 'word');
        else if (currentGamePhase === 26) renderQuizLayout(unitData.grammar[currentIndex], 'sentence');
    }, 1000);
}

function speakCurrentTarget() {
    let unitData = ALL_DATA[currentUnitId];
    const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
    let fileToPlay = "";
    
    if (currentGamePhase === 1 || currentGamePhase === 2 || currentGamePhase === 15) fileToPlay = currentVocabList[currentIndex].audio_file;
    else if (currentGamePhase === 25 || currentGamePhase === 26) fileToPlay = unitData.grammar[currentIndex].audio_file;
    else if (currentGamePhase === 3) fileToPlay = unitData.dialogs[currentIndex].audio_machine;

    if(currentGamePhase === 3 && document.getElementById('avatar-beth')) {
        document.getElementById('avatar-beth').classList.add('speaking');
    }
    playLocalAudio(fileToPlay);
}

function skipTask() {
    completedTasks++; currentIndex++; updateProgressBar(); loadTask();
}

function resetGame() {
    changeScreen('screen-welcome');
    document.getElementById('control-area').style.display = 'none';
}
