const ACCOUNTS = Object.freeze({
  elios: "elios@wordstep.invalid",
  eva_villega: "eva_villega@wordstep.invalid",
});
const LEVELS = new Set(["A1", "A2", "B1", "B2", "C1"]);

const loginScreen = document.querySelector("#login-screen");
const appShell = document.querySelector("#app-shell");
const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const wordsView = document.querySelector("#words-view");
const adminView = document.querySelector("#admin-view");
const quizView = document.querySelector("#quiz-view");
const wordList = document.querySelector("#word-list");
const wordSearch = document.querySelector("#word-search");
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
  const labels = { words: "Word library", quiz: "Quick quiz", admin: "Manage lessons" };
  const currentView = view === "admin" && currentProfile.role !== "admin" ? "words" : view;
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
  if (currentView === "quiz") startQuiz();
}

function renderWords() {
  const query = wordSearch.value.trim().toLowerCase();
  const visible = lessons.filter(({ word, definition, topic }) =>
    `${word} ${definition} ${topic}`.toLowerCase().includes(query));
  document.querySelector("#word-count").textContent = String(lessons.length);
  document.querySelector("#saved-count").textContent = String(savedWords.size);

  if (!visible.length) {
    wordList.innerHTML = `<div class="empty-search">${lessons.length ? "No words found. Try another search." : "Your lesson shelf is getting ready. Check back soon."}</div>`;
    return;
  }

  wordList.innerHTML = visible.map((lesson) => {
    const saved = savedWords.has(lesson.id);
    return `
      <article class="word-card">
        <div class="word-heading">
          <h3 class="word-title">${escapeHtml(lesson.word)}</h3>
          <span class="word-part">${escapeHtml(lesson.part_of_speech)}</span>
          <button class="speak-button" type="button" data-speak="${escapeHtml(lesson.word)}" aria-label="Hear ${escapeHtml(lesson.word)} pronounced">
            <svg aria-hidden="true"><use href="/icons.svg#icon-volume"></use></svg>
          </button>
        </div>
        <div><p class="word-definition">${escapeHtml(lesson.definition)}</p><span class="word-meta">${escapeHtml(lesson.topic)} <span>·</span> ${escapeHtml(lesson.level)}</span></div>
        <p class="word-example">${escapeHtml(lesson.example)}</p>
        <button class="save-button ${saved ? "saved" : ""}" type="button" data-save-word="${escapeHtml(lesson.id)}" aria-label="${saved ? "Remove" : "Save"} ${escapeHtml(lesson.word)} ${saved ? "from" : "to"} saved words" aria-pressed="${saved}">
          <svg aria-hidden="true"><use href="/icons.svg#icon-bookmark"></use></svg>
        </button>
      </article>`;
  }).join("");
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
  return shuffle([...lessons]).slice(0, Math.min(5, lessons.length)).map((correct) => ({
    correct,
    choices: shuffle([
      ...shuffle(lessons.filter(({ id }) => id !== correct.id)).slice(0, 3),
      correct,
    ]),
  }));
}

function startQuiz() {
  quizQuestions = createQuizQuestions();
  quizIndex = 0;
  quizScore = 0;
  if (lessons.length < 4) {
    quizCard.innerHTML = `
      <div class="quiz-topline"><span class="quiz-kicker"><svg aria-hidden="true"><use href="/icons.svg#icon-target"></use></svg> WORD CHECK</span><span class="quiz-progress-text" id="quiz-progress-text">COMING UP</span></div>
      <div class="progress-track"><span id="quiz-progress"></span></div>
      <div class="quiz-empty">
        <span class="quiz-result-mark"><svg aria-hidden="true"><use href="/icons.svg#icon-spark"></use></svg></span>
        <h2>Just a few more words.</h2>
        <p>Add at least four lessons before starting a quiz.</p>
      </div>`;
    return;
  }

  quizCard.innerHTML = `
    <div class="quiz-topline"><span class="quiz-kicker"><svg aria-hidden="true"><use href="/icons.svg#icon-target"></use></svg> WORD CHECK</span><span class="quiz-progress-text" id="quiz-progress-text"></span></div>
    <div class="progress-track"><span id="quiz-progress"></span></div>
    <div class="quiz-question-area">
      <span class="question-label">WHICH WORD MATCHES THIS MEANING?</span>
      <h2 id="quiz-question"></h2>
      <div class="answer-list" id="answer-list"></div>
      <div class="quiz-feedback" id="quiz-feedback" aria-live="polite"></div>
      <div class="quiz-actions"><span class="quiz-hint"><svg aria-hidden="true"><use href="/icons.svg#icon-spark"></use></svg> Take your time. You can always try again.</span><button class="button button-dark" id="quiz-next" type="button" disabled></button></div>
    </div>`;
  renderQuestion();
}

function renderQuestion() {
  const question = quizQuestions[quizIndex];
  if (!question) return renderQuizResult();

  selectedAnswer = -1;
  answered = false;
  document.querySelector("#quiz-progress-text").textContent = `QUESTION ${quizIndex + 1} OF ${quizQuestions.length}`;
  document.querySelector("#quiz-progress").style.width = `${(quizIndex / quizQuestions.length) * 100}%`;
  document.querySelector("#quiz-question").textContent = question.correct.definition;
  document.querySelector("#quiz-feedback").textContent = "";
  document.querySelector("#quiz-feedback").className = "quiz-feedback";
  const answers = document.querySelector("#answer-list");
  answers.innerHTML = question.choices.map(({ word }, index) => `
    <button class="answer-option" type="button" data-answer="${index}">
      <span class="answer-letter">${String.fromCharCode(65 + index)}</span><span class="answer-text">${escapeHtml(word)}</span>
    </button>`).join("");
  const next = document.querySelector("#quiz-next");
  next.disabled = true;
  next.innerHTML = 'Check answer <svg class="button-arrow" aria-hidden="true"><use href="/icons.svg#icon-arrow"></use></svg>';
}

function renderQuizResult() {
  document.querySelector("#quiz-progress-text").textContent = "ROUND COMPLETE";
  document.querySelector("#quiz-progress").style.width = "100%";
  const perfect = quizScore === quizQuestions.length;
  quizCard.innerHTML = `
    <div class="quiz-result">
      <span class="quiz-result-mark"><svg aria-hidden="true"><use href="/icons.svg#icon-spark"></use></svg></span>
      <span class="eyebrow">${perfect ? "A PERFECT LITTLE ROUND" : "LOOK AT YOU GO"}</span>
      <h2>${quizScore} out of ${quizQuestions.length} — nicely done.</h2>
      <p>${perfect ? "Every word in place. That’s something to feel good about." : "Every try helps the words settle in. Keep going at your own pace."}</p>
      <span class="quiz-xp">✦ ${quizScore * 10} practice points earned</span>
      <button class="button button-dark" id="quiz-retry" type="button">Try another round <svg class="button-arrow" aria-hidden="true"><use href="/icons.svg#icon-arrow"></use></svg></button>
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
      feedback.innerHTML = `<strong>That’s right!</strong> ${escapeHtml(question.correct.example)}`;
    } else {
      feedback.innerHTML = `<strong>Not quite — no worries.</strong> “${escapeHtml(question.correct.word)}” is the right fit. ${escapeHtml(question.correct.example)}`;
      feedback.classList.add("incorrect-feedback");
    }
    document.querySelector("#quiz-next").innerHTML = 'Next word <svg class="button-arrow" aria-hidden="true"><use href="/icons.svg#icon-arrow"></use></svg>';
    return;
  }

  quizIndex += 1;
  renderQuestion();
}

function clearLessonForm() {
  lessonForm.reset();
  lessonForm.querySelector("#lesson-id").value = "";
  lessonForm.elements.level.value = "A2";
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
  lessonForm.addEventListener("submit", handleLessonSubmit);
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
    const answer = event.target.closest("[data-answer]");
    if (answer && !answered) {
      selectedAnswer = Number(answer.dataset.answer);
      quizCard.querySelectorAll(".answer-option").forEach((option, index) => {
        option.classList.toggle("selected", index === selectedAnswer);
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
      loginForm.reset();
      showLoginError("");
    } catch (error) {
      console.error("Sign-out failed:", error);
      showAppError("We couldn’t sign you out. Please try again.");
    }
  });
}

async function initializeSupabase() {
  const config = window.WORDSTEP_SUPABASE_CONFIG;
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
