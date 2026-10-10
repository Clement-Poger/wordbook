const ACCOUNTS = Object.freeze({
  elios: "elios@word.book",
  eva: "eva@word.book",
});
const SUPABASE_CONFIG = Object.freeze({
  url: "https://henwzmiilnmzdwpmzunx.supabase.co",
  anonKey: "sb_publishable_V78pOOyxgz9pL6s6sCEbnQ_j5nx7W9u",
});
const LEVELS = new Set(["B1", "B2", "C1"]);

const loginScreen = document.querySelector("#login-screen");
const welcomeScreen = document.querySelector("#welcome-screen");
const loginPanel = document.querySelector("#login-panel");
const appShell = document.querySelector("#app-shell");
const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const wordsView = document.querySelector("#words-view");
const adminView = document.querySelector("#admin-view");
const quizView = document.querySelector("#quiz-view");
const wordList = document.querySelector("#word-list");
const wordSearch = document.querySelector("#word-search");
const levelFilter = document.querySelector("#level-filter");
const topicFilter = document.querySelector("#topic-filter");
const quizCard = document.querySelector("#quiz-card");
const lessonForm = document.querySelector("#lesson-form");
let supabaseClient;
let currentUser;
let currentProfile;
let lessons = [];
let savedWords = new Set();
let quizQuestions = [];
let quizIndex = 0;
let quizScore = 0;
let selectedAnswer = -1;
let answered = false;
let quizMode = "meaning";
let quizLevel = "all";
let quizLength = 5;
let quizStreak = 0;
let quizBestStreak = 0;
let quizPoints = 0;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function showLoginError(message) {
  loginError.textContent = message;
}

function showAppError(message) {
  const error = document.querySelector("#app-error");
  error.textContent = message;
  error.hidden = !message;
}

function showWelcome() {
  loginPanel.hidden = true;
  welcomeScreen.hidden = false;
  document.querySelector("#join-button").focus({ preventScroll: true });
}

function showLoginPanel() {
  welcomeScreen.hidden = true;
  loginPanel.hidden = false;
  loginForm.elements.username.focus({ preventScroll: true });
}

function storageKey() {
  return `wordstep:saved:${currentUser.id}`;
}

function readSavedWords() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey()) || "[]");
    if (!Array.isArray(parsed)) throw new Error("Saved words are not a list.");
    const validIds = new Set(lessons.map(({ id }) => id));
    savedWords = new Set(parsed.filter((id) => validIds.has(id)));
  } catch (error) {
    console.error("Saved words could not be loaded:", error);
    savedWords = new Set();
  }
}

function updateAccount() {
  const initial = currentProfile.username.charAt(0).toUpperCase();
  document.querySelector("#account-username").textContent = currentProfile.username;
  document.querySelector("#account-role").textContent = currentProfile.role === "admin" ? "Admin" : "Learner";
  document.querySelector("#avatar").textContent = initial;
  document.querySelector("#topbar-avatar").textContent = initial;
  document.querySelector("#today-label").textContent = new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date());
  document.querySelector("#admin-nav-item").hidden = currentProfile.role !== "admin";
}

function setView(view) {
  const labels = { words: "Word library", quiz: "Word quest", admin: "Manage lessons" };
  const currentView = view === "admin" && currentProfile.role !== "admin" ? "words" : view;
  const enteringQuiz = currentView === "quiz" && quizView.hidden;
  wordsView.hidden = currentView !== "words";
  quizView.hidden = currentView !== "quiz";
  adminView.hidden = currentView !== "admin";
  document.querySelector("#breadcrumb-page").textContent = labels[currentView];
  document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
    const selected = button.dataset.view === currentView;
    button.classList.toggle("active", selected);
    if (selected) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.querySelectorAll(".view-panel").forEach((panel) => {
    panel.classList.toggle("is-entering", !panel.hidden);
  });
  if (enteringQuiz) renderQuizSetup();
}

function renderWords() {
  const query = wordSearch.value.trim().toLowerCase();
  const selectedLevel = levelFilter.value;
  const selectedTopic = topicFilter.value;
  const savedOnly = document.querySelector("#saved-filter").getAttribute("aria-pressed") === "true";
  const topics = [...new Set(lessons.map(({ topic }) => topic))].sort((a, b) => a.localeCompare(b));
  const previousTopic = selectedTopic;
  topicFilter.innerHTML = '<option value="all">All topics</option>' + topics
    .map((topic) => `<option value="${escapeHtml(topic)}">${escapeHtml(topic)}</option>`).join("");
  topicFilter.value = topics.includes(previousTopic) ? previousTopic : "all";
  const visible = lessons.filter((lesson) => {
    const searchable = `${lesson.word} ${lesson.definition} ${lesson.example} ${lesson.part_of_speech} ${lesson.topic}`.toLowerCase();
    return searchable.includes(query)
      && (selectedLevel === "all" || lesson.level === selectedLevel)
      && (topicFilter.value === "all" || lesson.topic === topicFilter.value)
      && (!savedOnly || savedWords.has(lesson.id));
  });
  document.querySelector("#word-count").textContent = String(lessons.length);
  document.querySelector("#saved-count").textContent = String(savedWords.size);
  document.querySelector("#saved-filter-count").textContent = String(savedWords.size);
  document.querySelector("#results-count").textContent = `${visible.length} ${visible.length === 1 ? "word" : "words"}`;

  if (!visible.length) {
    const hasWords = lessons.length > 0;
    wordList.innerHTML = `<div class="empty-search"><span class="empty-search-icon"><img src="./assets/loupe.svg" class="icon-image" alt="" aria-hidden="true"></span><strong>${hasWords ? "No words match these filters" : "Your word shelf is ready to grow"}</strong><span>${hasWords ? "Try a different search or clear one of your filters." : "New lessons will show up here as soon as they are added."}</span>${hasWords ? '<button class="button button-quiet" id="clear-filters" type="button">Clear filters</button>' : ""}</div>`;
    return;
  }

  wordList.innerHTML = visible.map((lesson) => {
    const saved = savedWords.has(lesson.id);
    return `
      <article class="word-card">
        <div class="word-card-top"><span class="word-level level-${escapeHtml(lesson.level.toLowerCase())}">${escapeHtml(lesson.level)}</span><button class="save-button ${saved ? "saved" : ""}" type="button" data-save-word="${escapeHtml(lesson.id)}" aria-label="${saved ? "Remove" : "Save"} ${escapeHtml(lesson.word)} ${saved ? "from" : "to"} saved words" aria-pressed="${saved}"><img src="./assets/marque-page.svg" class="icon-image" alt="" aria-hidden="true"></button></div>
        <div class="word-heading">
          <h3 class="word-title">${escapeHtml(lesson.word)}</h3>
          <button class="speak-button" type="button" data-speak="${escapeHtml(lesson.word)}" aria-label="Hear ${escapeHtml(lesson.word)} pronounced">
            <img src="./assets/haut-parleur.svg" class="icon-image" alt="" aria-hidden="true">
          </button>
        </div>
        <span class="word-part">${escapeHtml(lesson.part_of_speech)}</span>
        <p class="word-definition">${escapeHtml(lesson.definition)}</p>
        <div class="word-card-bottom"><span class="word-topic"><img src="./assets/tags.svg" class="icon-image" alt="" aria-hidden="true">${escapeHtml(lesson.topic)}</span><p class="word-example">${escapeHtml(lesson.example)}</p></div>
      </article>`;
  }).join("");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  if (field.length || row.length) {
    row.push(field);
    if (row.some((value) => value.trim())) rows.push(row);
  }
  return rows;
}

function parseLessonCsv(text) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  const headers = rows.shift()?.map((header) => header.trim().toLowerCase());
  const required = ["word", "part_of_speech", "definition", "example", "level", "topic"];
  if (!headers || required.some((header) => !headers.includes(header))) {
    throw new Error(`CSV header must include: ${required.join(", ")}.`);
  }
  if (rows.length > 500) throw new Error("Please import no more than 500 lessons at a time.");
  return rows.map((values, index) => {
    const lesson = Object.fromEntries(required.map((key) => [key, String(values[headers.indexOf(key)] || "").trim()]));
    const rowNumber = index + 2;
    const limits = { word: 80, part_of_speech: 40, definition: 500, example: 500, topic: 60 };
    const errors = required.filter((key) => !lesson[key] || (limits[key] && lesson[key].length > limits[key]));
    if (!LEVELS.has(lesson.level)) errors.push("level (use B1, B2, or C1)");
    return { lesson, rowNumber, errors };
  });
}

async function importLessonsFromCsv(file) {
  if (currentProfile?.role !== "admin") throw new Error("Only the admin can import lessons.");
  const status = document.querySelector("#import-status");
  const button = document.querySelector("#csv-import-button");
  button.disabled = true;
  status.className = "import-status";
  status.textContent = "Reading your word list…";
  let imported = 0;
  try {
    const rows = parseLessonCsv(await file.text());
    const knownWords = new Set(lessons.map(({ word }) => word.toLocaleLowerCase()));
    const rejected = [];
    const ready = [];
    rows.forEach(({ lesson, rowNumber, errors }) => {
      if (errors.length) {
        rejected.push(`row ${rowNumber}: ${errors.join(", ")}`);
      } else if (knownWords.has(lesson.word.toLocaleLowerCase())) {
        rejected.push(`row ${rowNumber}: “${lesson.word}” already exists`);
      } else {
        knownWords.add(lesson.word.toLocaleLowerCase());
        ready.push({ ...lesson, created_by: currentUser.id });
      }
    });
    if (!ready.length) {
      const detail = rejected.slice(0, 4).join("; ");
      throw new Error(detail ? `No new lessons to import. ${detail}` : "This CSV has no lesson rows.");
    }

    for (let offset = 0; offset < ready.length; offset += 100) {
      const { error } = await supabaseClient.from("lessons").insert(ready.slice(offset, offset + 100));
      if (error) throw error;
      imported += Math.min(100, ready.length - offset);
    }
    await loadLessons();
    const skipped = rejected.length;
    status.textContent = `Added ${imported} ${imported === 1 ? "word" : "words"}${skipped ? ` · skipped ${skipped} invalid or duplicate ${skipped === 1 ? "row" : "rows"}${rejected.length ? ` (${rejected.slice(0, 3).join("; ")}${rejected.length > 3 ? "; …" : ""})` : ""}` : ""}.`;
    status.classList.add("success");
    document.querySelector("#csv-import-form").reset();
    document.querySelector("#csv-file-name").textContent = "Choose a .csv file";
  } catch (error) {
    console.error("CSV import failed:", error);
    if (imported) {
      try {
        await loadLessons();
      } catch (refreshError) {
        console.error("Imported lessons could not be refreshed:", refreshError);
        showAppError("Some lessons were imported, but the shelf could not be refreshed. Reload the page to see the latest words.");
      }
    }
    status.textContent = imported
      ? `Added ${imported} words before import stopped. ${error.message || "Check the connection and retry with the remaining rows."}`
      : error.message || "We couldn’t import this CSV. Check its format and try again.";
    status.classList.add("error");
  } finally {
    button.disabled = !document.querySelector("#csv-file").files.length;
  }
}

function renderAdminLessons() {
  const manager = document.querySelector("#lesson-manager-list");
  document.querySelector("#manager-count").textContent = `${lessons.length} ${lessons.length === 1 ? "lesson" : "lessons"}`;
  if (!lessons.length) {
    manager.innerHTML = '<div class="empty-search">Add the first word lesson above.</div>';
    return;
  }

  manager.innerHTML = lessons.map((lesson) => `
    <article class="manager-row">
      <div class="manager-word"><strong>${escapeHtml(lesson.word)}</strong><span>${escapeHtml(lesson.part_of_speech)} · ${escapeHtml(lesson.level)} · ${escapeHtml(lesson.topic)}</span></div>
      <p>${escapeHtml(lesson.definition)}</p>
      <div class="manager-actions">
        <button class="button button-quiet" type="button" data-edit-lesson="${escapeHtml(lesson.id)}">Edit</button>
        <button class="button button-danger" type="button" data-delete-lesson="${escapeHtml(lesson.id)}">Remove</button>
      </div>
    </article>`).join("");
}

async function loadLessons() {
  showAppError("");
  const { data, error } = await supabaseClient
    .from("lessons")
    .select("id, word, part_of_speech, definition, example, level, topic")
    .order("word", { ascending: true });
  if (error) {
    console.error("Lessons could not be loaded:", error);
    throw new Error("We couldn’t load the lesson shelf. Check the Supabase table and sign-in policies.");
  }

  lessons = data;
  readSavedWords();
  renderWords();
  if (currentProfile.role === "admin") renderAdminLessons();
}

async function enterAccount(user) {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("username, role")
    .eq("id", user.id)
    .single();

  if (error || !data || ACCOUNTS[data.username] !== user.email || !["admin", "user"].includes(data.role)) {
    console.error("The signed-in account has no matching Wordstep role profile:", error);
    await supabaseClient.auth.signOut();
    throw new Error("This account isn’t set up for Wordstep. Ask the administrator to check its profile.");
  }

  currentUser = user;
  currentProfile = data;
  updateAccount();
  loginScreen.hidden = true;
  appShell.hidden = false;
  setView("words");
  try {
    await loadLessons();
  } catch (error) {
    showAppError(error.message || "We couldn’t load the lesson shelf.");
  }
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[otherIndex]] = [items[otherIndex], items[index]];
  }
  return items;
}

function createQuizQuestions() {
  const pool = lessons.filter((lesson) => quizLevel === "all" || lesson.level === quizLevel);
  const eligible = quizMode === "sentence"
    ? pool.filter(({ word, example }) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(example))
    : pool;
  return shuffle([...eligible]).slice(0, Math.min(quizLength, eligible.length)).map((correct) => ({
    correct,
    choices: shuffle([
      ...shuffle(pool.filter(({ id }) => id !== correct.id)).slice(0, 3),
      correct,
    ]),
  }));
}

function renderQuizSetup() {
  let highScore = 0;
  try {
    highScore = Number(localStorage.getItem(`wordstep:highscore:${currentUser.id}`) || 0);
  } catch (error) {
    console.error("Quiz personal best could not be loaded:", error);
  }
  const levels = ["all", "B1", "B2", "C1"];
  const modes = [
    { id: "meaning", title: "Find the word", description: "Read a meaning and choose the matching word.", icon: "./assets/livre.svg" },
    { id: "definition", title: "Know the meaning", description: "See a word and pick what it means.", icon: "./assets/logo.svg" },
    { id: "sentence", title: "Complete the sentence", description: "Use context clues to fill in the missing word.", icon: "./assets/document.svg" },
  ];
  const levelCount = quizLevel === "all" ? lessons.length : lessons.filter(({ level }) => level === quizLevel).length;
  const sentenceCount = lessons.filter(({ word, example, level }) =>
    (quizLevel === "all" || level === quizLevel)
      && new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(example)).length;
  const eligibleCount = quizMode === "sentence" ? sentenceCount : levelCount;
  quizLength = Math.min(quizLength, eligibleCount || 5);
  const lengths = [5, 10, 20].filter((length) => length <= eligibleCount);
  if (eligibleCount > 0 && !lengths.includes(eligibleCount)) lengths.push(eligibleCount);
  lengths.sort((a, b) => a - b);

  quizCard.innerHTML = `
    <div class="quest-welcome">
      <div class="quest-welcome-copy">
        <span class="quest-kicker"><img src="./assets/fleche-dans-le-mille.svg" class="icon-image" alt="" aria-hidden="true"> READY, SET, LEARN</span>
        <h2>Make today’s words<br><span>count.</span></h2>
        <p>Pick a challenge, find your rhythm, and earn points as you go.</p>
        <div class="quest-personal-best"><span class="best-icon"><img src="./assets/badge.svg" class="icon-image" alt="" aria-hidden="true"></span><span><small>PERSONAL BEST</small><strong>${highScore} pts</strong></span></div>
      </div>
      <div class="quest-orbit" aria-hidden="true"><span class="orbit-ring orbit-ring-one"></span><span class="orbit-ring orbit-ring-two"></span><span class="orbit-core"><img src="./assets/logo.svg" class="icon-image" alt="" aria-hidden="true"></span><span class="orbit-word orbit-word-one">learn</span><span class="orbit-word orbit-word-two">grow</span><span class="orbit-word orbit-word-three">repeat</span></div>
    </div>
    <div class="quest-setup">
      <div class="setup-section">
        <div class="setup-title"><span class="setup-step">01</span><span><strong>Choose your level</strong><small>Pick a level, or mix them all.</small></span></div>
        <div class="level-picks">${levels.map((level) => {
          const count = level === "all" ? lessons.length : lessons.filter(({ level: itemLevel }) => itemLevel === level).length;
          return `<button class="level-pick ${quizLevel === level ? "selected" : ""}" type="button" data-quiz-level="${level}" aria-pressed="${quizLevel === level}" ${count === 0 && level !== "all" ? "disabled" : ""}><span>${level === "all" ? "All levels" : level}</span><small>${count} ${count === 1 ? "word" : "words"}</small></button>`;
        }).join("")}</div>
      </div>
      <div class="setup-section">
        <div class="setup-title"><span class="setup-step">02</span><span><strong>Choose your challenge</strong><small>Switch it up to strengthen your recall.</small></span></div>
        <div class="mode-picks">${modes.map((mode) => `<button class="mode-pick ${quizMode === mode.id ? "selected" : ""}" type="button" data-quiz-mode="${mode.id}" aria-pressed="${quizMode === mode.id}" ${mode.id === "sentence" && sentenceCount === 0 ? "disabled" : ""}><span class="mode-icon"><img src="${mode.icon}" class="icon-image" alt="" aria-hidden="true"></span><span class="mode-copy"><strong>${mode.title}</strong><small>${mode.description}</small></span><span class="mode-check"><img src="./assets/coche.svg" class="icon-image" alt="" aria-hidden="true"></span></button>`).join("")}</div>
      </div>
      <div class="setup-bottom">
        <div class="round-length"><div class="setup-title"><span class="setup-step">03</span><span><strong>Round length</strong><small>${eligibleCount} words available</small></span></div><div class="length-picks">${lengths.map((length) => `<button class="length-pick ${quizLength === length ? "selected" : ""}" type="button" data-quiz-length="${length}" aria-pressed="${quizLength === length}">${length} <small>words</small></button>`).join("")}</div></div>
        <button class="button button-dark quest-start" id="quiz-start" type="button" ${eligibleCount < 4 ? "disabled" : ""}><span>Start quest</span><img src="./assets/arrow-right.svg" class="button-arrow icon-image" alt="" aria-hidden="true"></button>
      </div>
      ${eligibleCount < 4 ? `<p class="quest-note">${quizMode === "sentence" ? "Add at least four words with matching example sentences to unlock this challenge." : "Add at least four words at this level to start a quest."}</p>` : ""}
    </div>`;
}

function startQuiz() {
  quizQuestions = createQuizQuestions();
  quizIndex = 0;
  quizScore = 0;
  quizPoints = 0;
  quizStreak = 0;
  quizBestStreak = 0;
  if (quizQuestions.length < 4) {
    renderQuizSetup();
    return;
  }
  renderQuestion();
}

function renderQuizShell() {
  const progress = quizQuestions.length ? (quizIndex / quizQuestions.length) * 100 : 0;
  return `<div class="quest-gamebar"><button class="quest-exit" id="quiz-exit" type="button"><img src="./assets/arrow-right.svg" class="icon-image" alt="" aria-hidden="true"> Quit quest</button><div class="quest-progress-copy"><span>YOUR PROGRESS</span><strong id="quiz-progress-text"></strong></div><div class="quest-live-stats"><span class="live-stat"><img src="./assets/flamme.svg" class="icon-image" alt="" aria-hidden="true"><b id="quiz-streak">${quizStreak}</b><small>streak</small></span><span class="live-stat live-points"><img src="./assets/logo.svg" class="icon-image" alt="" aria-hidden="true"><b id="quiz-points">${quizPoints}</b><small>pts</small></span></div></div><div class="quest-progress-track"><span id="quiz-progress" style="width:${progress}%"></span></div><div class="quiz-question-area"><span class="question-label" id="quiz-prompt-label"></span><h2 id="quiz-question"></h2><div class="answer-list" id="answer-list" role="group" aria-labelledby="quiz-question"></div><div class="quiz-feedback" id="quiz-feedback" aria-live="polite"></div><div class="quiz-actions"><span class="quiz-hint" id="quiz-hint"><img src="./assets/logo.svg" class="icon-image" alt="" aria-hidden="true"> Take a moment — you’ve got this.</span><button class="button button-dark" id="quiz-next" type="button" disabled><span>Check answer</span><img src="./assets/arrow-right.svg" class="button-arrow icon-image" alt="" aria-hidden="true"></button></div></div>`;
}

function renderQuestion() {
  const question = quizQuestions[quizIndex];
  if (!question) return renderQuizResult();

  selectedAnswer = -1;
  answered = false;
  quizCard.innerHTML = renderQuizShell();
  document.querySelector("#quiz-progress-text").textContent = `${quizIndex + 1} / ${quizQuestions.length}`;
  const prompts = {
    meaning: ["WHICH WORD MATCHES THIS MEANING?", question.correct.definition],
    definition: ["WHAT DOES THIS WORD MEAN?", question.correct.word],
    sentence: ["COMPLETE THE SENTENCE", question.correct.example.replace(new RegExp(`\\b${question.correct.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), "________")],
  };
  document.querySelector("#quiz-prompt-label").textContent = prompts[quizMode][0];
  document.querySelector("#quiz-question").textContent = prompts[quizMode][1];
  document.querySelector("#quiz-feedback").textContent = "";
  document.querySelector("#quiz-feedback").className = "quiz-feedback";
  const answers = document.querySelector("#answer-list");
  answers.innerHTML = question.choices.map((choice, index) => {
    const label = quizMode === "definition" ? choice.definition : choice.word;
    return `
    <button class="answer-option" type="button" data-answer="${index}" aria-pressed="false">
      <span class="answer-letter">${String.fromCharCode(65 + index)}</span><span class="answer-text">${escapeHtml(label)}</span>
    </button>`;
  }).join("");
}

function renderQuizResult() {
  const highScoreKey = `wordstep:highscore:${currentUser.id}`;
  let previousBest = 0;
  try {
    previousBest = Number(localStorage.getItem(highScoreKey) || 0);
  } catch (error) {
    console.error("Quiz personal best could not be loaded:", error);
  }
  const perfect = quizScore === quizQuestions.length;
  const isNewBest = quizPoints > previousBest;
  if (isNewBest) {
    try {
      localStorage.setItem(highScoreKey, String(quizPoints));
    } catch (error) {
      console.error("Quiz best score could not be saved:", error);
    }
  }
  quizCard.innerHTML = `
    <div class="quiz-result">
      <span class="quest-result-burst"><span class="quiz-result-mark"><img src="./assets/badge.svg" class="icon-image" alt="" aria-hidden="true"></span><span class="result-spark result-spark-one">✦</span><span class="result-spark result-spark-two">✧</span></span>
      <span class="eyebrow">${isNewBest ? "NEW PERSONAL BEST!" : perfect ? "FLAWLESS QUEST!" : "QUEST COMPLETE!"}</span>
      <h2>${quizScore} <span>/ ${quizQuestions.length}</span></h2>
      <p>${perfect ? "Every word was right on target. Look at you go!" : "Every answer is progress. Your new words are settling in."}</p>
      <div class="result-stats"><span><img src="./assets/logo.svg" class="icon-image" alt="" aria-hidden="true"><strong>${quizPoints}</strong><small>points earned</small></span><span><img src="./assets/flamme.svg" class="icon-image" alt="" aria-hidden="true"><strong>${quizBestStreak}</strong><small>best streak</small></span><span><img src="./assets/badge.svg" class="icon-image" alt="" aria-hidden="true"><strong>${Math.round((quizScore / quizQuestions.length) * 100)}%</strong><small>accuracy</small></span></div>
      <div class="result-actions"><button class="button button-quiet" id="quiz-back-setup" type="button">Change challenge</button><button class="button button-dark" id="quiz-retry" type="button">Play again <img src="./assets/arrow-right.svg" class="button-arrow icon-image" alt="" aria-hidden="true"></button></div>
    </div>`;
}

function submitAnswer() {
  if (!answered) {
    if (selectedAnswer < 0) return;
    answered = true;
    const question = quizQuestions[quizIndex];
    const correctIndex = question.choices.findIndex(({ id }) => id === question.correct.id);
    const buttons = [...quizCard.querySelectorAll(".answer-option")];
    buttons.forEach((button, index) => {
      button.disabled = true;
      if (index === correctIndex) button.classList.add("correct");
      if (index === selectedAnswer && index !== correctIndex) button.classList.add("incorrect");
    });

    const feedback = document.querySelector("#quiz-feedback");
    if (selectedAnswer === correctIndex) {
      quizScore += 1;
      quizStreak += 1;
      quizBestStreak = Math.max(quizBestStreak, quizStreak);
      quizPoints += 10 + Math.min(quizStreak - 1, 5) * 2;
      feedback.innerHTML = `<span class="feedback-mark"><img src="./assets/coche.svg" class="icon-image" alt="" aria-hidden="true"></span><span><strong>${quizStreak > 1 ? `${quizStreak} in a row!` : "That’s right!"}</strong><small>${escapeHtml(question.correct.example)}</small></span>`;
      feedback.classList.add("correct-feedback");
    } else {
      quizStreak = 0;
      feedback.innerHTML = `<span class="feedback-mark"><img src="./assets/logo.svg" class="icon-image" alt="" aria-hidden="true"></span><span><strong>Good try! The answer is “${escapeHtml(question.correct.word)}”.</strong><small>${escapeHtml(question.correct.definition)} ${escapeHtml(question.correct.example)}</small></span>`;
      feedback.classList.add("incorrect-feedback");
    }
    document.querySelector("#quiz-streak").textContent = String(quizStreak);
    document.querySelector("#quiz-points").textContent = String(quizPoints);
    const progress = ((quizIndex + 1) / quizQuestions.length) * 100;
    document.querySelector("#quiz-progress").style.width = `${progress}%`;
    const nextButton = document.querySelector("#quiz-next");
    nextButton.disabled = false;
    nextButton.innerHTML = quizIndex + 1 === quizQuestions.length
      ? '<span>See results</span><img src="./assets/arrow-right.svg" class="button-arrow icon-image" alt="" aria-hidden="true">'
      : '<span>Next word</span><img src="./assets/arrow-right.svg" class="button-arrow icon-image" alt="" aria-hidden="true">';
    return;
  }

  quizIndex += 1;
  renderQuestion();
}

function clearLessonForm() {
  lessonForm.reset();
  lessonForm.querySelector("#lesson-id").value = "";
  lessonForm.elements.level.value = "B1";
  lessonForm.elements.topic.value = "Everyday";
  document.querySelector("#lesson-form-title").textContent = "Create a word lesson";
  document.querySelector("#lesson-submit span").textContent = "Add lesson";
  document.querySelector("#lesson-cancel").hidden = true;
  document.querySelector("#lesson-error").textContent = "";
}

function editLesson(id) {
  const lesson = lessons.find((entry) => entry.id === id);
  if (!lesson) return;
  lessonForm.elements.id.value = lesson.id;
  lessonForm.elements.word.value = lesson.word;
  lessonForm.elements.part_of_speech.value = lesson.part_of_speech;
  lessonForm.elements.definition.value = lesson.definition;
  lessonForm.elements.example.value = lesson.example;
  lessonForm.elements.level.value = lesson.level;
  lessonForm.elements.topic.value = lesson.topic;
  document.querySelector("#lesson-form-title").textContent = `Edit “${lesson.word}”`;
  document.querySelector("#lesson-submit span").textContent = "Save changes";
  document.querySelector("#lesson-cancel").hidden = false;
  document.querySelector("#lesson-error").textContent = "";
  lessonForm.scrollIntoView({ behavior: "smooth", block: "start" });
  lessonForm.elements.word.focus({ preventScroll: true });
}

function handleWordActions(event) {
  if (!(event.target instanceof Element)) return;
  const speakButton = event.target.closest("[data-speak]");
  if (speakButton && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(speakButton.dataset.speak);
    utterance.lang = "en-US";
    utterance.rate = 0.86;
    window.speechSynthesis.speak(utterance);
    return;
  }

  const saveButton = event.target.closest("[data-save-word]");
  if (!saveButton) return;
  const { saveWord } = saveButton.dataset;
  if (savedWords.has(saveWord)) savedWords.delete(saveWord);
  else savedWords.add(saveWord);
  try {
    localStorage.setItem(storageKey(), JSON.stringify([...savedWords]));
  } catch (error) {
    console.error("Saved words could not be stored:", error);
    showAppError("Your saved words changed for this visit but couldn’t be saved on this device.");
  }
  renderWords();
}

function showRequestError(container, prefix, error) {
  console.error(prefix, error);
  container.textContent = error.code === "23505"
    ? "That word is already in the library. Edit the existing lesson instead."
    : `${prefix} Please check the database connection and try again.`;
}

async function handleLessonSubmit(event) {
  event.preventDefault();
  const errorMessage = document.querySelector("#lesson-error");
  const submitButton = document.querySelector("#lesson-submit");
  errorMessage.textContent = "";
  submitButton.disabled = true;
  const values = new FormData(lessonForm);
  const id = String(values.get("id") || "");
  const payload = {
    word: String(values.get("word")).trim(),
    part_of_speech: String(values.get("part_of_speech")).trim(),
    definition: String(values.get("definition")).trim(),
    example: String(values.get("example")).trim(),
    level: String(values.get("level")),
    topic: String(values.get("topic")).trim(),
  };
  if (!LEVELS.has(payload.level)) {
    errorMessage.textContent = "Choose a valid English level.";
    submitButton.disabled = false;
    return;
  }

  try {
    const result = id
      ? await supabaseClient.from("lessons").update(payload).eq("id", id)
      : await supabaseClient.from("lessons").insert({ ...payload, created_by: currentUser.id });
    if (result.error) {
      showRequestError(errorMessage, "We couldn’t save this lesson.", result.error);
      return;
    }
    clearLessonForm();
    await loadLessons();
    showAppError("");
  } catch (error) {
    showRequestError(errorMessage, "We couldn’t save this lesson.", error);
  } finally {
    submitButton.disabled = false;
  }
}

async function handleLessonManager(event) {
  if (!(event.target instanceof Element)) return;
  const editButton = event.target.closest("[data-edit-lesson]");
  if (editButton) return editLesson(editButton.dataset.editLesson);

  const deleteButton = event.target.closest("[data-delete-lesson]");
  if (!deleteButton) return;
  const lesson = lessons.find(({ id }) => id === deleteButton.dataset.deleteLesson);
  if (!lesson || !window.confirm(`Remove “${lesson.word}” from the shared library?`)) return;

  deleteButton.disabled = true;
  const { error } = await supabaseClient.from("lessons").delete().eq("id", lesson.id);
  if (error) {
    deleteButton.disabled = false;
    showRequestError(document.querySelector("#lesson-error"), "We couldn’t remove this lesson.", error);
    return;
  }
  clearLessonForm();
  await loadLessons();
}

function wireEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  document.querySelector("#join-button").addEventListener("click", showLoginPanel);
  document.querySelector("#login-back").addEventListener("click", showWelcome);

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showLoginError("");
    const button = loginForm.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      if (!supabaseClient) throw new Error("Supabase isn’t configured yet. Follow the setup steps in the README.");
      const username = loginForm.elements.username.value.trim().toLowerCase();
      const email = ACCOUNTS[username];
      if (!email) throw new Error("That username and password don’t match.");

      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password: loginForm.elements.password.value,
      });
      if (error) throw error;
      loginForm.reset();
      await enterAccount(data.user);
    } catch (error) {
      console.error("Sign-in failed:", error);
      showLoginError(error.message === "Invalid login credentials"
        ? "That username and password don’t match."
        : error.message || "Couldn’t sign in. Please try again.");
    } finally {
      button.disabled = false;
    }
  });

  wordList.addEventListener("click", handleWordActions);
  wordSearch.addEventListener("input", renderWords);
  levelFilter.addEventListener("change", renderWords);
  topicFilter.addEventListener("change", renderWords);
  document.querySelector("#saved-filter").addEventListener("click", (event) => {
    const button = event.currentTarget;
    const pressed = button.getAttribute("aria-pressed") !== "true";
    button.setAttribute("aria-pressed", String(pressed));
    renderWords();
  });
  wordList.addEventListener("click", (event) => {
    if (!(event.target instanceof Element) || !event.target.closest("#clear-filters")) return;
    wordSearch.value = "";
    levelFilter.value = "all";
    topicFilter.value = "all";
    document.querySelector("#saved-filter").setAttribute("aria-pressed", "false");
    renderWords();
    wordSearch.focus();
  });
  lessonForm.addEventListener("submit", handleLessonSubmit);
  const csvFile = document.querySelector("#csv-file");
  const csvImportForm = document.querySelector("#csv-import-form");
  csvFile.addEventListener("change", () => {
    const file = csvFile.files[0];
    document.querySelector("#csv-file-name").textContent = file?.name || "Choose a .csv file";
    document.querySelector("#csv-import-button").disabled = !file;
    document.querySelector("#import-status").textContent = "";
    document.querySelector("#import-status").className = "import-status";
  });
  csvImportForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const file = csvFile.files[0];
    if (!file) return;
    if (file.size > 2_000_000) {
      const status = document.querySelector("#import-status");
      status.textContent = "This file is larger than 2 MB. Split it into smaller CSV files and try again.";
      status.className = "import-status error";
      return;
    }
    importLessonsFromCsv(file);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey
      && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
      event.preventDefault();
      wordSearch.focus();
    }
    if (event.key === "Escape" && document.activeElement === wordSearch) {
      wordSearch.value = "";
      renderWords();
      wordSearch.blur();
    }
  });
  document.querySelector("#lesson-cancel").addEventListener("click", clearLessonForm);
  document.querySelector("#lesson-manager-list").addEventListener("click", (event) => {
    handleLessonManager(event).catch((error) => showRequestError(
      document.querySelector("#lesson-error"),
      "We couldn’t update the lesson shelf.",
      error,
    ));
  });
  quizCard.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const levelButton = event.target.closest("[data-quiz-level]");
    if (levelButton && !levelButton.disabled) {
      quizLevel = levelButton.dataset.quizLevel;
      renderQuizSetup();
      return;
    }
    const modeButton = event.target.closest("[data-quiz-mode]");
    if (modeButton && !modeButton.disabled) {
      quizMode = modeButton.dataset.quizMode;
      renderQuizSetup();
      return;
    }
    const lengthButton = event.target.closest("[data-quiz-length]");
    if (lengthButton) {
      quizLength = Number(lengthButton.dataset.quizLength);
      renderQuizSetup();
      return;
    }
    if (event.target.closest("#quiz-start")) {
      startQuiz();
      return;
    }
    if (event.target.closest("#quiz-exit") || event.target.closest("#quiz-back-setup")) {
      renderQuizSetup();
      return;
    }
    const answer = event.target.closest("[data-answer]");
    if (answer && !answered) {
      selectedAnswer = Number(answer.dataset.answer);
      quizCard.querySelectorAll(".answer-option").forEach((option, index) => {
        option.classList.toggle("selected", index === selectedAnswer);
        option.setAttribute("aria-pressed", String(index === selectedAnswer));
      });
      document.querySelector("#quiz-next").disabled = false;
      return;
    }
    if (event.target.closest("#quiz-next")) submitAnswer();
    if (event.target.closest("#quiz-retry")) startQuiz();
  });

  document.querySelector("#logout-button").addEventListener("click", async () => {
    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) throw error;
      currentUser = undefined;
      currentProfile = undefined;
      lessons = [];
      appShell.hidden = true;
      loginScreen.hidden = false;
      showWelcome();
      loginForm.reset();
      showLoginError("");
    } catch (error) {
      console.error("Sign-out failed:", error);
      showAppError("We couldn’t sign you out. Please try again.");
    }
  });
}

async function initializeSupabase() {
  const config = SUPABASE_CONFIG;
  if (!config?.url || !config?.anonKey) {
    showLoginError("Supabase isn’t configured yet. Follow the setup steps in the README.");
    return;
  }
  if (!window.supabase?.createClient) {
    showLoginError("The Supabase sign-in library couldn’t load. Check your internet connection and refresh.");
    return;
  }

  try {
    const projectUrl = new URL(config.url);
    if (projectUrl.protocol !== "https:" && projectUrl.hostname !== "localhost") {
      throw new Error("The Supabase URL must use HTTPS.");
    }
    supabaseClient = window.supabase.createClient(config.url, config.anonKey);
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (data.session) await enterAccount(data.session.user);
  } catch (error) {
    console.error("Supabase could not be initialized:", error);
    showLoginError(error.message || "Couldn’t connect to Supabase. Check the project settings.");
  }
}

wireEvents();
initializeSupabase();
