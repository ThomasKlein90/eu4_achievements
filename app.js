const STORAGE_KEY = "eu4-achievements-progress-v1";
const DIFFICULTIES = ["I", "VH", "H", "M", "E", "VE"];
const DIFFICULTY_NAMES = {
  I: "Impossible",
  VH: "Very hard",
  H: "Hard",
  M: "Medium",
  E: "Easy",
  VE: "Very easy",
};
const DIFFICULTY_RANK = { I: 6, VH: 5, H: 4, M: 3, E: 2, VE: 1 };
const difficultyFilters = {
  achievements: new Set(DIFFICULTIES),
  runs: new Set(DIFFICULTIES),
};
const numberFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

let dataset;
let achievementsById;
let totalAchievementPoints = 0;
let progressOverrides = {};
let expandedAchievements = new Set();
let expandedRuns = new Set();
let expandedRunAchievements = new Set();
let suggestedRunId = null;
let toastTimeout;

const $ = (selector) => document.querySelector(selector);
const escapeHTML = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return replacements[character];
  });
const difficultyCode = (value) => String(value || "").trim().toUpperCase();
const completed = (achievement) =>
  Object.hasOwn(progressOverrides, achievement.id)
    ? progressOverrides[achievement.id]
    : achievement.done;
const points = (value) => numberFormat.format(value || 0);
const rarityPercent = (value) => {
  const percentage = (value || 0) * 100;
  return `${percentage.toFixed(percentage > 0 && percentage < 1 ? 2 : 1)}%`;
};
const difficultyBadge = (value) => {
  const code = difficultyCode(value);
  return `<span class="difficulty-badge difficulty-${escapeHTML(code)}" title="${escapeHTML(DIFFICULTY_NAMES[code] || code)}">${escapeHTML(code)}</span>`;
};
const achievementById = (id) => achievementsById.get(id);

function syncDifficultyFilter(name) {
  const selected = difficultyFilters[name];
  const allCheckbox = $(`[data-difficulty-all="${name}"]`);
  const count = selected.size;
  allCheckbox.checked = count === DIFFICULTIES.length;
  allCheckbox.indeterminate = count > 0 && count < DIFFICULTIES.length;
  const label =
    count === 0
      ? "No difficulties"
      : count === DIFFICULTIES.length
        ? "All difficulties"
        : count === 1
          ? DIFFICULTY_NAMES[[...selected][0]]
          : `${count} difficulties`;
  $(`[data-difficulty-label="${name}"]`).textContent = label;
}

function setAllDifficulties(name) {
  difficultyFilters[name] = new Set(DIFFICULTIES);
  for (const checkbox of document.querySelectorAll(
    `[data-difficulty-option="${name}"]`,
  )) {
    checkbox.checked = true;
  }
  syncDifficultyFilter(name);
}

function closeDifficultyFilters(except) {
  document.querySelectorAll(".difficulty-filter").forEach((filter) => {
    if (filter.dataset.difficultyFilter === except) return;
    const trigger = filter.querySelector(".difficulty-filter-trigger");
    const menu = filter.querySelector(".difficulty-filter-menu");
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  });
}

function matchesDifficultyFilter(name, value) {
  const selected = difficultyFilters[name];
  return (
    selected.size === DIFFICULTIES.length ||
    selected.has(difficultyCode(value))
  );
}

function notify(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("visible"), 2500);
}

function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progressOverrides));
  } catch (error) {
    console.error("Unable to save achievement progress locally.", error);
    notify("Could not save progress in this browser.");
  }
}

function loadProgress() {
  let savedProgress;
  try {
    savedProgress = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.error("Unable to access local achievement progress.", error);
    notify("This browser blocked local progress storage.");
    return;
  }
  if (!savedProgress) return;

  try {
    const parsed = JSON.parse(savedProgress);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new TypeError("Saved progress must be an object.");
    }
    progressOverrides = Object.fromEntries(
      Object.entries(parsed).filter(
        ([id, value]) =>
          achievementsById.has(id) && typeof value === "boolean",
      ),
    );
  } catch (error) {
    console.error("Unable to read saved achievement progress.", error);
    progressOverrides = {};
    notify("Saved progress could not be read; workbook progress is shown.");
  }
}

function getSummary() {
  let earnedPoints = 0;
  let totalPoints = 0;
  let doneCount = 0;

  for (const achievement of dataset.achievements) {
    totalPoints += achievement.points;
    if (completed(achievement)) {
      doneCount += 1;
      earnedPoints += achievement.points;
    }
  }

  const total = dataset.achievements.length;
  const remainingPoints = totalPoints - earnedPoints;
  return {
    doneCount,
    total,
    earnedPoints,
    totalPoints,
    remainingPoints,
    percent: totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0,
    countPercent: total > 0 ? (doneCount / total) * 100 : 0,
  };
}

function getRunProgress(run) {
  const entries = run.achievementIds.map(achievementById).filter(Boolean);
  const remaining = entries.filter((achievement) => !completed(achievement));
  const remainingPoints = remaining.reduce(
    (total, achievement) => total + achievement.points,
    0,
  );

  return {
    entries,
    remaining,
    remainingPoints,
    isComplete: entries.length > 0 && remaining.length === 0,
  };
}

function renderOverview() {
  const summary = getSummary();
  const remainingRuns = dataset.runs.filter(
    (run) => !getRunProgress(run).isComplete,
  ).length;

  $("#sidebar-percent").textContent = `${summary.percent.toFixed(1)}%`;
  $("#sidebar-bar").style.width = `${summary.percent}%`;
  $("#sidebar-done").textContent = numberFormat.format(summary.doneCount);
  $("#weighted-percent").textContent = `${summary.percent.toFixed(1)}%`;
  $("#progress-ring").style.setProperty(
    "--progress",
    `${summary.percent.toFixed(2)}%`,
  );
  $("#done-count").textContent = numberFormat.format(summary.doneCount);
  $("#total-count").textContent = numberFormat.format(summary.total);
  $("#earned-points").textContent = points(summary.earnedPoints);
  $("#total-points").textContent = points(summary.totalPoints);
  $("#earned-footer").textContent = numberFormat.format(summary.doneCount);
  $("#remaining-footer").textContent = numberFormat.format(
    summary.total - summary.doneCount,
  );
  $("#runs-remaining").textContent = numberFormat.format(remainingRuns);
  $("#nav-achievement-count").textContent = numberFormat.format(summary.total);
  $("#nav-run-count").textContent = numberFormat.format(remainingRuns);
  $("#archive-total").textContent = numberFormat.format(summary.total);
  $("#archive-completed").textContent = numberFormat.format(summary.doneCount);
  $("#source-label").textContent = `SOURCE · ${dataset.source}`;

  const earned = dataset.achievements.filter(completed);
  const rarest = [...earned]
    .sort(
      (left, right) =>
        left.rarity - right.rarity ||
        (DIFFICULTY_RANK[difficultyCode(right.difficulty)] || 0) -
          (DIFFICULTY_RANK[difficultyCode(left.difficulty)] || 0) ||
        right.points - left.points,
    )
    .slice(0, 5);
  const hardest = [...earned]
    .sort((left, right) => {
      const rank =
        (DIFFICULTY_RANK[difficultyCode(right.difficulty)] || 0) -
        (DIFFICULTY_RANK[difficultyCode(left.difficulty)] || 0);
      return rank || right.points - left.points;
    })
    .slice(0, 5);
  const missing = dataset.achievements
    .filter((achievement) => !completed(achievement))
    .sort((left, right) => right.points - left.points)
    .slice(0, 5);

  $("#rarest-list").innerHTML = renderInsightItems(rarest, (achievement) =>
    rarityPercent(achievement.rarity),
  );
  $("#hardest-list").innerHTML = renderInsightItems(
    hardest,
    (achievement) => `${difficultyCode(achievement.difficulty)} · ${points(achievement.points)} pts`,
  );
  $("#missing-list").innerHTML = renderInsightItems(missing, (achievement) =>
    `${points(achievement.points)} pts`,
  );
  renderDifficultyChart();
}

function renderInsightItems(achievements, detail) {
  if (!achievements.length) {
    return `<div class="insight-empty">Your next milestone is waiting to be claimed.</div>`;
  }
  return achievements
    .map(
      (achievement, index) => `
        <div class="insight-item">
          <span class="insight-rank">0${index + 1}</span>
          <span class="insight-name" title="${escapeHTML(achievement.name)}">${escapeHTML(achievement.name)}</span>
          <span class="insight-detail">${escapeHTML(detail(achievement))}</span>
        </div>`,
    )
    .join("");
}

function renderDifficultyChart() {
  const chart = DIFFICULTIES.map((difficulty) => {
    const tier = dataset.achievements.filter(
      (achievement) => difficultyCode(achievement.difficulty) === difficulty,
    );
    const doneCount = tier.filter(completed).length;
    const percentage = tier.length ? (doneCount / tier.length) * 100 : 0;
    const label = DIFFICULTY_NAMES[difficulty];
    const className = `difficulty-${difficulty}`;
    return `
      <div class="difficulty-column ${className}">
        <div class="difficulty-topline"><span class="difficulty-label">${escapeHTML(difficulty)}</span><span class="difficulty-count"><strong class="difficulty-done-count">${doneCount}</strong><span>/${tier.length}</span></span></div>
        <div class="difficulty-bar" title="${escapeHTML(label)}: ${doneCount} of ${tier.length}"><span class="difficulty-fill" style="width:${percentage.toFixed(2)}%"></span></div>
        <div class="difficulty-bottomline"><span>${escapeHTML(label)}</span><strong>${percentage.toFixed(0)}%</strong></div>
      </div>`;
  }).join("");
  $("#difficulty-chart").innerHTML = chart;
}

function searchableText(achievement) {
  return [
    achievement.name,
    achievement.description,
    achievement.difficulty,
    achievement.startingCountry,
    achievement.startingConditions,
    achievement.requirements,
    achievement.notes,
  ]
    .join(" ")
    .toLocaleLowerCase();
}

function getVisibleAchievements() {
  const query = $("#achievement-search").value.trim().toLocaleLowerCase();
  const status = $("#achievement-status").value;
  const sort = $("#achievement-sort").value;

  return dataset.achievements
    .filter((achievement) => {
      const isDone = completed(achievement);
      return (
        (!query || searchableText(achievement).includes(query)) &&
        (status === "all" ||
          (status === "completed" && isDone) ||
          (status === "remaining" && !isDone)) &&
        matchesDifficultyFilter("achievements", achievement.difficulty)
      );
    })
    .sort((left, right) => {
      if (sort === "name") {
        return left.name.localeCompare(right.name);
      }
      if (sort === "rarity") {
        return left.rarity - right.rarity || right.points - left.points;
      }
      if (sort === "difficulty") {
        return (
          (DIFFICULTY_RANK[difficultyCode(right.difficulty)] || 0) -
            (DIFFICULTY_RANK[difficultyCode(left.difficulty)] || 0) ||
          right.points - left.points
        );
      }
      return right.points - left.points || left.name.localeCompare(right.name);
    });
}

function renderAchievementCard(achievement) {
  const isDone = completed(achievement);
  const expanded = expandedAchievements.has(achievement.id);
  const country = achievement.startingCountry || "—";

  return `
    <article class="achievement-card${expanded ? " expanded" : ""}" data-achievement-card="${escapeHTML(achievement.id)}">
      <div class="achievement-row">
        <button class="achievement-toggle" type="button" data-toggle-achievement="${escapeHTML(achievement.id)}" aria-label="${isDone ? "Mark" : "Mark"} ${escapeHTML(achievement.name)} ${isDone ? "incomplete" : "complete"}" aria-pressed="${isDone}"></button>
        <button class="achievement-card-main" type="button" data-expand-achievement="${escapeHTML(achievement.id)}" aria-expanded="${expanded}">
          <span class="achievement-name">${escapeHTML(achievement.name)}</span>
          <span class="achievement-description">${escapeHTML(achievement.description)}</span>
        </button>
        <div class="achievement-detail country-detail"><span class="detail-label">STARTING AS</span>${escapeHTML(country)}</div>
        <div class="achievement-detail">${difficultyBadge(achievement.difficulty)}</div>
        <div class="achievement-detail points-detail"><span class="detail-label">WEIGHT</span><span class="points-value">${points(achievement.points)}</span></div>
        <button class="expand-button" type="button" data-expand-achievement="${escapeHTML(achievement.id)}" aria-label="${expanded ? "Collapse" : "Expand"} ${escapeHTML(achievement.name)}" aria-expanded="${expanded}">⌄</button>
      </div>
      <div class="achievement-extra">
        ${renderAchievementDetails(achievement)}
      </div>
    </article>`;
}

function renderAchievementDetails(achievement) {
  const details = [
    achievement.startingConditions &&
      `<section class="extra-block"><h3>STARTING CONDITIONS</h3><p>${escapeHTML(achievement.startingConditions)}</p></section>`,
    achievement.requirements &&
      `<section class="extra-block"><h3>COMPLETION REQUIREMENTS</h3><p>${escapeHTML(achievement.requirements)}</p></section>`,
    achievement.notes &&
      `<section class="extra-block full"><h3>NOTES</h3><p>${escapeHTML(achievement.notes)}</p></section>`,
  ]
    .filter(Boolean)
    .join("");

  return `
    <p class="extra-description">${escapeHTML(achievement.description)}</p>
    <div class="extra-grid">
      <section class="extra-block"><h3>RARITY &amp; POINTS</h3><p>${rarityPercent(achievement.rarity)} of players · ${points(achievement.points)} weighted points</p></section>
      ${details || `<section class="extra-block"><h3>DETAILS</h3><p>No extra conditions or notes in the workbook.</p></section>`}
    </div>`;
}

function renderAchievements() {
  const achievements = getVisibleAchievements();
  $("#achievement-results").textContent = `${numberFormat.format(achievements.length)} shown`;
  $("#achievement-list").innerHTML = achievements
    .map(renderAchievementCard)
    .join("");
  $("#achievement-empty").hidden = achievements.length > 0;
}

function getVisibleRuns() {
  const query = $("#run-search").value.trim().toLocaleLowerCase();
  return dataset.runs
    .filter((run) => {
      const progress = getRunProgress(run);
      const haystack = [
        run.name,
        run.country,
        run.difficulty,
        ...progress.entries.map((entry) => entry.name),
      ]
        .join(" ")
        .toLocaleLowerCase();
      return (
        !progress.isComplete &&
        (!query || haystack.includes(query)) &&
        matchesDifficultyFilter("runs", run.difficulty)
      );
    })
    .sort((left, right) =>
      left.id.localeCompare(right.id, undefined, { numeric: true }),
    );
}

function renderRunCard(run) {
  const progress = getRunProgress(run);
  const expanded = expandedRuns.has(run.id);
  const totalProgressShare =
    totalAchievementPoints > 0
      ? (progress.remainingPoints / totalAchievementPoints) * 100
      : 0;
  const achievements = progress.entries
    .map((achievement) => {
      const detailKey = `${run.id}:${achievement.id}`;
      const detailExpanded = expandedRunAchievements.has(detailKey);
      return `
        <div class="run-achievement-card${detailExpanded ? " expanded" : ""}">
          <div class="run-achievement">
            <button class="achievement-toggle" type="button" data-toggle-achievement="${escapeHTML(achievement.id)}" aria-label="Mark ${escapeHTML(achievement.name)} ${completed(achievement) ? "incomplete" : "complete"}" aria-pressed="${completed(achievement)}"></button>
            <button class="run-achievement-info" type="button" data-expand-run-achievement="${escapeHTML(detailKey)}" aria-expanded="${detailExpanded}">
              <strong>${escapeHTML(achievement.name)}</strong>
              <span>${escapeHTML(achievement.description)}</span>
            </button>
            ${difficultyBadge(achievement.difficulty)}
            <span class="run-achievement-points">${points(achievement.points)} pts</span>
            <button class="run-achievement-expand" type="button" data-expand-run-achievement="${escapeHTML(detailKey)}" aria-label="${detailExpanded ? "Collapse" : "Expand"} ${escapeHTML(achievement.name)} details" aria-expanded="${detailExpanded}">⌄</button>
          </div>
          <div class="run-achievement-details">${renderAchievementDetails(achievement)}</div>
        </div>`;
    })
    .join("");
  const customNation =
    run.customNation &&
    !["no", "n", "false"].includes(run.customNation.trim().toLowerCase());

  return `
    <article class="run-card${expanded ? " expanded" : ""}" data-run-card="${escapeHTML(run.id)}">
      <button class="run-card-head" type="button" data-expand-run="${escapeHTML(run.id)}" aria-expanded="${expanded}">
        <span class="run-number">#${escapeHTML(run.id)}</span>
        <span class="run-title"><span class="run-title-heading"><strong>${escapeHTML(run.name)}</strong>${difficultyBadge(run.difficulty)}</span><span>${progress.entries.length} ${progress.entries.length === 1 ? "achievement" : "achievements"}${customNation ? " · Custom nation possible" : ""}</span></span>
        <span class="run-country"><span>START AS</span><strong>${escapeHTML(run.country || "—")}</strong></span>
        <span class="run-total-share">${totalProgressShare.toFixed(2)}%<span>OF TOTAL</span></span>
        <span class="run-chevron">⌄</span>
      </button>
      <div class="run-details">
        <div class="run-details-heading"><span>${escapeHTML(run.country || "Starting country not specified")} · ${escapeHTML(DIFFICULTY_NAMES[difficultyCode(run.difficulty)] || run.difficulty)} run</span><span>${progress.remaining.length} left to claim</span></div>
        ${achievements}
        <div class="run-total-line"><span>Points still available</span><strong>${points(progress.remainingPoints)} pts</strong></div>
      </div>
    </article>`;
}

function renderRuns() {
  const remainingRuns = dataset.runs.filter(
    (run) => !getRunProgress(run).isComplete,
  );
  $("#run-stat-total").textContent = numberFormat.format(remainingRuns.length);
  $("#run-stat-points").textContent = points(
    remainingRuns.reduce(
      (total, run) => total + getRunProgress(run).remainingPoints,
      0,
    ),
  );
  const runs = getVisibleRuns();
  $("#run-results").textContent = `${numberFormat.format(runs.length)} remaining runs`;
  $("#run-list").innerHTML = runs.map(renderRunCard).join("");
  $("#run-empty").hidden = runs.length > 0;
  renderSuggestion();
}

function renderSuggestion() {
  const wrapper = $("#suggestion-wrap");
  const run = dataset.runs.find((item) => item.id === suggestedRunId);
  if (!run || getRunProgress(run).isComplete) {
    suggestedRunId = null;
    wrapper.hidden = true;
    wrapper.innerHTML = "";
    return;
  }

  const progress = getRunProgress(run);
  const totalProgressShare =
    totalAchievementPoints > 0
      ? (progress.remainingPoints / totalAchievementPoints) * 100
      : 0;
  wrapper.hidden = false;
  wrapper.innerHTML = `
    <article class="suggestion-card">
      <span class="suggestion-star">✳</span>
      <div class="suggestion-copy">
        <span class="suggestion-label">YOUR NEXT CAMPAIGN · RANDOM PICK</span>
        <h2>${escapeHTML(run.name)}</h2>
        <p>Start as ${escapeHTML(run.country || "a country of your choice")}</p>
        <span class="suggestion-achievement-count"><strong>${progress.entries.length}</strong><span>ACHIEVEMENTS IN THIS RUN</span><span class="suggestion-count-divider">·</span><span>${progress.remaining.length} left to earn</span></span>
      </div>
      <div class="suggestion-meta">
        ${difficultyBadge(run.difficulty)}
        <span class="suggestion-points">${points(progress.remainingPoints)} pts<span>AVAILABLE</span></span>
        <span class="suggestion-share">${totalProgressShare.toFixed(2)}%<span>OF TOTAL</span></span>
      </div>
      <button class="suggestion-close" type="button" data-action="dismiss-suggestion" aria-label="Dismiss suggestion">×</button>
      <button class="button button-secondary" type="button" data-action="open-suggested-run">View run</button>
    </article>`;
}

function showView(viewName) {
  const validViews = ["overview", "achievements", "runs"];
  if (!validViews.includes(viewName)) viewName = "overview";

  document.querySelectorAll(".view-panel").forEach((panel) => {
    const active = panel.id === `view-${viewName}`;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });
  document.querySelectorAll(".nav-link").forEach((button) => {
    const active = button.dataset.view === viewName;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  $("#page-crumb").textContent = viewName.toUpperCase();
  if (viewName === "achievements") renderAchievements();
  if (viewName === "runs") renderRuns();
  history.replaceState(null, "", `#${viewName}`);
}

function updateProgress(achievementId) {
  const achievement = achievementById(achievementId);
  if (!achievement) return;
  const newValue = !completed(achievement);
  if (newValue === achievement.done) {
    delete progressOverrides[achievementId];
  } else {
    progressOverrides[achievementId] = newValue;
  }
  saveProgress();
  renderOverview();
  renderAchievements();
  renderRuns();
  notify(
    `${achievement.name} marked ${newValue ? "complete" : "incomplete"}.`,
  );
}

function resetProgress() {
  if (
    !window.confirm(
      "Reset your local progress overrides? Achievement completion will return to the workbook values.",
    )
  ) {
    return;
  }
  progressOverrides = {};
  saveProgress();
  expandedAchievements.clear();
  renderOverview();
  renderAchievements();
  renderRuns();
  notify("Local progress reset to the workbook.");
}

async function refreshDataset(button) {
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Refreshing…";
  try {
    const url = new URL("data/achievements.json", location.href);
    url.searchParams.set("refresh", Date.now().toString());
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Dataset request failed (${response.status}).`);
    }
    const refreshedDataset = await response.json();
    if (
      !refreshedDataset ||
      !Array.isArray(refreshedDataset.achievements) ||
      !Array.isArray(refreshedDataset.runs)
    ) {
      throw new TypeError("Dataset is missing its achievement or run records.");
    }
    dataset = refreshedDataset;
    achievementsById = new Map(
      dataset.achievements.map((achievement) => [achievement.id, achievement]),
    );
    totalAchievementPoints = dataset.achievements.reduce(
      (total, achievement) => total + achievement.points,
      0,
    );
    progressOverrides = Object.fromEntries(
      Object.entries(progressOverrides).filter(([id]) => achievementsById.has(id)),
    );
    saveProgress();
    renderOverview();
    renderAchievements();
    renderRuns();
    notify("Latest published data loaded. Local progress overrides were kept.");
  } catch (error) {
    console.error("Unable to refresh the published EU4 dataset.", error);
    notify("Could not refresh published data. Try again after deployment.");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function bindEvents() {
  $(".brand").addEventListener("click", (event) => {
    event.preventDefault();
    showView("overview");
  });
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });
  document.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.go));
  });
  $("#achievement-search").addEventListener("input", renderAchievements);
  $("#achievement-status").addEventListener("change", renderAchievements);
  $("#achievement-sort").addEventListener("change", renderAchievements);
  $("#run-search").addEventListener("input", renderRuns);

  document.body.addEventListener("change", (event) => {
    const checkbox = event.target;
    if (!(checkbox instanceof HTMLInputElement)) return;

    if (checkbox.dataset.difficultyAll) {
      const name = checkbox.dataset.difficultyAll;
      difficultyFilters[name] = checkbox.checked
        ? new Set(DIFFICULTIES)
        : new Set();
      document
        .querySelectorAll(`[data-difficulty-option="${name}"]`)
        .forEach((option) => {
          option.checked = checkbox.checked;
        });
      syncDifficultyFilter(name);
      if (name === "achievements") renderAchievements();
      else renderRuns();
      return;
    }

    if (checkbox.dataset.difficultyOption) {
      const name = checkbox.dataset.difficultyOption;
      if (checkbox.checked) {
        difficultyFilters[name].add(checkbox.value);
      } else {
        difficultyFilters[name].delete(checkbox.value);
      }
      syncDifficultyFilter(name);
      if (name === "achievements") renderAchievements();
      else renderRuns();
    }
  });

  document.addEventListener("click", (event) => {
    if (event.target instanceof Element && !event.target.closest(".difficulty-filter")) {
      closeDifficultyFilters();
    }
  });

  document.body.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target) return;

    if (target.dataset.difficultyToggle) {
      const name = target.dataset.difficultyToggle;
      const menu = $(`#${name === "runs" ? "run" : "achievement"}-difficulty-menu`);
      const shouldOpen = menu.hidden;
      closeDifficultyFilters(name);
      menu.hidden = !shouldOpen;
      target.setAttribute("aria-expanded", String(shouldOpen));
      return;
    }

    if (target.dataset.toggleAchievement) {
      updateProgress(target.dataset.toggleAchievement);
      return;
    }
    if (target.dataset.expandAchievement) {
      const id = target.dataset.expandAchievement;
      if (expandedAchievements.has(id)) expandedAchievements.delete(id);
      else expandedAchievements.add(id);
      renderAchievements();
      return;
    }
    if (target.dataset.expandRun) {
      const id = target.dataset.expandRun;
      if (expandedRuns.has(id)) expandedRuns.delete(id);
      else expandedRuns.add(id);
      renderRuns();
      return;
    }
    if (target.dataset.expandRunAchievement) {
      const key = target.dataset.expandRunAchievement;
      if (expandedRunAchievements.has(key)) expandedRunAchievements.delete(key);
      else expandedRunAchievements.add(key);
      renderRuns();
      return;
    }

    switch (target.dataset.action) {
      case "refresh-data":
        refreshDataset(target);
        break;
      case "suggest-run": {
        const remaining = dataset.runs.filter(
          (run) => !getRunProgress(run).isComplete,
        );
        if (!remaining.length) {
          suggestedRunId = null;
          renderRuns();
          notify("Every planned run is complete. A new campaign awaits.");
          return;
        }
        const currentIndex = remaining.findIndex(
          (run) => run.id === suggestedRunId,
        );
        let nextIndex = Math.floor(Math.random() * remaining.length);
        if (remaining.length > 1 && nextIndex === currentIndex) {
          nextIndex = (nextIndex + 1) % remaining.length;
        }
        suggestedRunId = remaining[nextIndex].id;
        renderRuns();
        break;
      }
      case "dismiss-suggestion":
        suggestedRunId = null;
        renderSuggestion();
        break;
      case "open-suggested-run": {
        if (!suggestedRunId) return;
        const runId = suggestedRunId;
        setAllDifficulties("runs");
        $("#run-search").value = "";
        expandedRuns.add(runId);
        renderRuns();
        requestAnimationFrame(() => {
          document
            .querySelector(`[data-run-card="${CSS.escape(runId)}"]`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        break;
      }
      case "clear-achievement-filters":
        $("#achievement-search").value = "";
        $("#achievement-status").value = "all";
        setAllDifficulties("achievements");
        $("#achievement-sort").value = "points";
        renderAchievements();
        break;
      case "reset-progress":
        resetProgress();
        break;
      default:
        break;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const openFilter = document.querySelector(
        '.difficulty-filter-trigger[aria-expanded="true"]',
      );
      if (openFilter instanceof HTMLButtonElement) {
        closeDifficultyFilters();
        openFilter.focus();
      }
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      showView("achievements");
      $("#achievement-search").focus();
    }
    if (event.key === "Escape" && suggestedRunId) {
      suggestedRunId = null;
      renderSuggestion();
    }
  });
}

function showLoadError(error) {
  console.error("Unable to load the EU4 achievement dataset.", error);
  const main = $(".main-content");
  main.innerHTML = `
    <section class="load-error">
      <div class="eyebrow"><span class="eyebrow-line"></span>ARCHIVE UNAVAILABLE</div>
      <h1>Couldn’t load the campaign ledger.</h1>
      <p>Serve this project over HTTP and confirm <code>data/achievements.json</code> exists. See the README for the local start command.</p>
      <p class="muted">${escapeHTML(error.message || String(error))}</p>
    </section>`;
}

async function initialize() {
  const response = await fetch("data/achievements.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Dataset request failed (${response.status}).`);
  }
  dataset = await response.json();
  if (
    !dataset ||
    !Array.isArray(dataset.achievements) ||
    !Array.isArray(dataset.runs)
  ) {
    throw new TypeError("Dataset is missing its achievement or run records.");
  }
  achievementsById = new Map(
    dataset.achievements.map((achievement) => [achievement.id, achievement]),
  );
  totalAchievementPoints = dataset.achievements.reduce(
    (total, achievement) => total + achievement.points,
    0,
  );
  loadProgress();
  bindEvents();
  renderOverview();
  renderAchievements();
  renderRuns();

  const requestedView = location.hash.replace(/^#/, "");
  showView(requestedView || "overview");
}

initialize().catch(showLoadError);
