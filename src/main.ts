import "./style.css";

type Segment = {
  id: number;
  days: number;
  frequency: string;
  tablets: Record<number, number>;
};

type AutoConfig = {
  startDose: number;
  stepDays: number;
  mode: "mg" | "tablet";
  stepMg: number;
  stepStrength: number;
  stepTablets: number;
  lastRemainder: number | null;
};

type AppState = {
  medication: "prednisolone" | "prednisone" | "dexamethasone";
  useDates: boolean;
  startDate: string;
  strengths: number[];
  customStrength: string;
  segments: Segment[];
  auto: AutoConfig;
  handoutReady: boolean;
};

const DEFAULT_STRENGTHS = [1, 2.5, 5, 10, 20, 25];
const DEFAULT_FREQUENCIES = [
  "Once daily (od)",
  "Twice daily (bd)",
  "Three times daily (tds)",
  "Every other day (eod)",
  "Morning only (mane)",
  "Evening only (nocte)",
];

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) throw new Error("App root not found");
const appEl: HTMLDivElement = appRoot;

let segmentId = 1;

function getInitialState(): AppState {
  return {
    medication: "prednisolone",
    useDates: true,
    startDate: "",
    strengths: [25, 5],
    customStrength: "",
    segments: [
      createSegment({ days: 3, frequency: "Once daily (od)", tablets: { 25: 1, 5: 1 } }),
      createSegment({ days: 3, frequency: "Once daily (od)", tablets: { 25: 1, 5: 0 } }),
      createSegment({ days: 3, frequency: "Once daily (od)", tablets: { 25: 0, 5: 4 } }),
    ],
    auto: {
      startDose: 30,
      stepDays: 3,
      mode: "mg",
      stepMg: 5,
      stepStrength: 5,
      stepTablets: 1,
      lastRemainder: null,
    },
    handoutReady: false,
  };
}

const state: AppState = getInitialState();

function createSegment({
  days,
  frequency,
  tablets,
}: {
  days: number;
  frequency: string;
  tablets: Record<number, number>;
}): Segment {
  return {
    id: segmentId++,
    days,
    frequency,
    tablets: { ...tablets },
  };
}

function normalizeStrengths() {
  const unique = Array.from(
    new Set(state.strengths.map((value) => Number(value)).filter((v) => !Number.isNaN(v)))
  );
  unique.sort((a, b) => b - a);
  state.strengths = unique;
  state.segments.forEach((segment) => {
    const nextTablets: Record<number, number> = {};
    unique.forEach((strength) => {
      nextTablets[strength] = Number(segment.tablets[strength] || 0);
    });
    segment.tablets = nextTablets;
  });
}

function updateSegment(id: number, updater: (segment: Segment) => void) {
  const idx = state.segments.findIndex((segment) => segment.id === id);
  if (idx === -1) return;
  updater(state.segments[idx]);
}

function formatStrength(strength: number) {
  return Number(strength) % 1 === 0 ? String(strength) : strength.toString();
}

function formatDose(tablets: Record<number, number>) {
  const parts = Object.entries(tablets)
    .filter(([, count]) => Number(count) > 0)
    .map(([strength, count]) => `${count} x ${formatStrength(Number(strength))} mg`);
  return parts.length ? parts.join(" + ") : "0 mg";
}

function totalDose(tablets: Record<number, number>) {
  return Object.entries(tablets).reduce((sum, [strength, count]) => {
    return sum + Number(strength) * Number(count || 0);
  }, 0);
}

function formatDateDisplay(value: string) {
  const parts = value.split("-");
  if (parts.length !== 3) return value;
  const [year, month, day] = parts;
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function addDays(startDate: string, offset: number) {
  const date = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + offset);
  return formatDateDisplay(date.toISOString().slice(0, 10));
}

function expandSchedule() {
  const schedule: {
    day: number;
    week: number;
    date: string | null;
    doseText: string;
    frequency: string;
  }[] = [];
  let dayIndex = 0;

  state.segments.forEach((segment) => {
    const doseText = formatDose(segment.tablets);
    const doseTotal = totalDose(segment.tablets);
    if (doseTotal <= 0) return;
    for (let i = 0; i < Number(segment.days || 0); i += 1) {
      dayIndex += 1;
      const week = Math.floor((dayIndex - 1) / 7) + 1;
      const date = state.useDates && state.startDate ? addDays(state.startDate, dayIndex - 1) : null;
      schedule.push({
        day: dayIndex,
        week,
        date,
        doseText,
        frequency: segment.frequency,
      });
    }
  });

  return schedule;
}

function allocateTablets(total: number, strengths: number[]) {
  let remaining = total;
  const tablets: Record<number, number> = {};
  strengths.forEach((strength) => {
    const rawCount = remaining / strength;
    const count = Math.max(0, Math.floor(rawCount * 2) / 2);
    tablets[strength] = count;
    remaining -= count * strength;
    remaining = Math.round(remaining * 100) / 100;
  });

  return { tablets, remainder: remaining };
}

function generateAutoSchedule() {
  normalizeStrengths();
  const segments: Segment[] = [];
  const stepDays = Math.max(1, Number(state.auto.stepDays) || 1);
  let dose = Math.max(0, Number(state.auto.startDose) || 0);
  let remainder: number | null = null;

  const decrement = () => {
    if (state.auto.mode === "mg") {
      return Math.max(0, Number(state.auto.stepMg) || 0);
    }
    const strength = Number(state.auto.stepStrength) || 0;
    const count = Number(state.auto.stepTablets) || 0;
    return strength * count;
  };

  const step = decrement();
  let guard = 0;
  while (dose > 0 && guard < 200) {
    const { tablets, remainder: rem } = allocateTablets(dose, state.strengths);
    remainder = rem;
    segments.push(createSegment({ days: stepDays, frequency: "Once daily (od)", tablets }));
    dose = Math.max(0, dose - step);
    guard += 1;
  }

  state.auto.lastRemainder = remainder;
  if (segments.length) {
    state.segments = segments;
  }
  state.handoutReady = false;
}

function renderStrengths() {
  return DEFAULT_STRENGTHS.map((strength) => {
    const checked = state.strengths.includes(strength);
    return `
      <label class="pill flex items-center gap-2">
        <input type="checkbox" data-action="toggle-strength" data-strength="${strength}" ${
      checked ? "checked" : ""
    } />
        ${formatStrength(strength)} mg
      </label>
    `;
  }).join("");
}

function renderSegments() {
  return state.segments
    .map((segment, idx) => {
      const isPresetFrequency = DEFAULT_FREQUENCIES.includes(segment.frequency);
      const selectValue = isPresetFrequency ? segment.frequency : "__custom";
      const customFrequencyValue = isPresetFrequency ? "" : segment.frequency;
      const tabletInputs = state.strengths
        .map((strength) => {
          const value = segment.tablets[strength] ?? 0;
          return `
            <div class="field">
              <label class="field-label">${formatStrength(strength)} mg tabs</label>
              <input class="input" type="number" step="0.5" min="0" value="${value}" data-action="update-tablet" data-id="${
            segment.id
          }" data-strength="${strength}" />
            </div>
          `;
        })
        .join("");

      const total = totalDose(segment.tablets).toFixed(1).replace(/\.0$/, "");

      return `
        <div class="rounded-2xl border border-clay bg-white/80 p-4">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <strong class="font-display">Step ${idx + 1}</strong>
            <div class="flex flex-wrap gap-2">
              <button class="btn" data-action="move-up" data-id="${segment.id}">Up</button>
              <button class="btn" data-action="move-down" data-id="${segment.id}">Down</button>
              <button class="btn" data-action="duplicate" data-id="${segment.id}">Duplicate</button>
              <button class="btn" data-action="remove" data-id="${segment.id}">Remove</button>
            </div>
          </div>
          <div class="grid gap-3 md:grid-cols-3">
            <div class="field">
              <label class="field-label">Days</label>
              <input class="input" type="number" min="1" value="${segment.days}" data-action="update-days" data-id="${
        segment.id
      }" />
            </div>
            <div class="field">
              <label class="field-label">Frequency</label>
              <select class="input" data-action="update-frequency-select" data-id="${segment.id}">
                ${DEFAULT_FREQUENCIES.map(
                  (freq) =>
                    `<option value="${freq}" ${selectValue === freq ? "selected" : ""}>${freq}</option>`
                ).join("")}
                <option value="__custom" ${selectValue === "__custom" ? "selected" : ""}>Custom...</option>
              </select>
              ${
                selectValue === "__custom"
                  ? `<input class="input mt-2" placeholder="Custom frequency" value="${customFrequencyValue}" data-action="update-frequency-custom" data-id="${segment.id}" />`
                  : ""
              }
            </div>
            <div class="field">
              <label class="field-label">Total dose</label>
              <input class="input" value="${total} mg" disabled />
            </div>
          </div>
          <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            ${tabletInputs}
          </div>
        </div>
      `;
    })
    .join("");
}

function renderScheduleTable() {
  const schedule = expandSchedule();
  if (schedule.length === 0) {
    return `<div class="notice">No schedule rows yet. Add a step or run the auto taper.</div>`;
  }

  const headerCells = [
    state.useDates ? "<th class=\"border border-clay bg-sand/60 px-2 py-2 text-left\">Date</th>" : "",
    "<th class=\"border border-clay bg-sand/60 px-2 py-2 text-left\">Day</th>",
    "<th class=\"border border-clay bg-sand/60 px-2 py-2 text-left\">Week</th>",
    "<th class=\"border border-clay bg-sand/60 px-2 py-2 text-left\">Tablets</th>",
    "<th class=\"border border-clay bg-sand/60 px-2 py-2 text-left\">Frequency</th>",
    "<th class=\"border border-clay bg-sand/60 px-2 py-2 text-left\">Done</th>",
  ]
    .filter(Boolean)
    .join("");

  const rows = schedule
    .map((entry) => {
      return `
        <tr>
          ${
            state.useDates
              ? `<td class="border border-clay px-2 py-2 text-xs">${entry.date ?? ""}</td>`
              : ""
          }
          <td class="border border-clay px-2 py-2 text-xs">Day ${entry.day}</td>
          <td class="border border-clay px-2 py-2 text-xs">Week ${entry.week}</td>
          <td class="border border-clay px-2 py-2 text-xs">${entry.doseText}</td>
          <td class="border border-clay px-2 py-2 text-xs">${entry.frequency}</td>
          <td class="border border-clay px-2 py-2 text-xs"><span class="inline-block h-4 w-4 border border-ink"></span></td>
        </tr>
      `;
    })
    .join("");

  return `
    <table class="mt-4 w-full border-collapse text-left text-xs">
      <thead>
        <tr>${headerCells}</tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

function render() {
  normalizeStrengths();

  const medicationLabelMap: Record<AppState["medication"], string> = {
    prednisolone: "Prednisolone (Sone)",
    prednisone: "Prednisone (Solone)",
    dexamethasone: "Dexamethasone",
  };
  const medicationLabel = medicationLabelMap[state.medication];

  appEl.innerHTML = `
    <div class="app-shell min-h-screen bg-[radial-gradient(circle_at_top,_#f6faf8_0%,_#e7f0ea_45%,_#dbe3de_100%)]">
      <header class="no-print flex flex-wrap items-center justify-between gap-4 px-[6vw] pt-8">
        <div class="flex items-center gap-4">
          <div class="grid h-14 w-14 place-items-center rounded-2xl bg-moss text-white shadow-soft font-display">xSone</div>
          <div>
            <h1 class="text-2xl">Taper Handout Builder</h1>
            <p class="text-sm text-ink/70">Auto-generate, review, then print a clear taper schedule.</p>
          </div>
        </div>
        <div class="flex gap-3">
          <button class="btn btn-ghost" data-action="reset-all">Reset</button>
        </div>
      </header>

      <main class="grid gap-6 px-[6vw] pb-16 pt-6 lg:grid-cols-[minmax(320px,_1.1fr)_minmax(320px,_0.9fr)]">
        <section class="panel no-print">
          <h2 class="text-lg">Step 1 — Auto taper generator</h2>
          <p class="mt-1 text-sm text-ink/70">Start here to create the draft taper, then review the steps before printing.</p>
          <div class="mt-4 grid gap-3">
            <div class="field">
              <label class="field-label">Medication</label>
              <div class="flex flex-wrap gap-2">
                <label class="pill flex items-center gap-2">
                  <input type="radio" name="medication" value="prednisolone" data-action="set-medication" ${
      state.medication === "prednisolone" ? "checked" : ""
    } />
                  Prednisolone (Sone)
                </label>
                <label class="pill flex items-center gap-2">
                  <input type="radio" name="medication" value="prednisone" data-action="set-medication" ${
      state.medication === "prednisone" ? "checked" : ""
    } />
                  Prednisone (Solone)
                </label>
                <label class="pill flex items-center gap-2">
                  <input type="radio" name="medication" value="dexamethasone" data-action="set-medication" ${
      state.medication === "dexamethasone" ? "checked" : ""
    } />
                  Dexamethasone
                </label>
              </div>
            </div>

            <div class="field">
              <label class="field-label">Schedule style</label>
              <div class="flex flex-wrap items-center gap-3">
                <label class="pill flex items-center gap-2">
                  <input type="checkbox" data-action="toggle-dates" ${state.useDates ? "checked" : ""} />
                  Show calendar dates
                </label>
                <div class="field min-w-[180px]">
                  <label class="field-label">Start date</label>
                  <input class="input" type="date" value="${state.startDate}" data-action="set-start-date" ${
      state.useDates ? "" : "disabled"
    } />
                </div>
              </div>
            </div>
          </div>

          <div class="mt-6 border-t border-dashed border-clay pt-4">
            <h2 class="text-lg">Tablet strengths</h2>
            <div class="mt-3 flex flex-wrap gap-2">${renderStrengths()}</div>
            <div class="mt-3 flex flex-wrap gap-2">
              <input class="input w-32" type="number" min="0" step="0.5" placeholder="Custom mg" value="${
                state.customStrength
              }" data-action="custom-strength" />
              <button class="btn" data-action="add-custom-strength">Add strength</button>
            </div>
          </div>

          <div class="mt-6 border-t border-dashed border-clay pt-4">
            <h2 class="text-lg">Auto taper settings</h2>
            <div class="mt-3 grid gap-3 md:grid-cols-3">
              <div class="field">
                <label class="field-label">Start dose (mg)</label>
                <input class="input" type="number" min="0" step="0.5" value="${
                  state.auto.startDose
                }" data-action="auto-start" />
              </div>
              <div class="field">
                <label class="field-label">Step length (days)</label>
                <input class="input" type="number" min="1" value="${
                  state.auto.stepDays
                }" data-action="auto-days" />
              </div>
              <div class="field">
                <label class="field-label">Reduction style</label>
                <select class="input" data-action="auto-mode">
                  <option value="mg" ${state.auto.mode === "mg" ? "selected" : ""}>Reduce by mg</option>
                  <option value="tablet" ${
                    state.auto.mode === "tablet" ? "selected" : ""
                  }>Reduce by tablets</option>
                </select>
              </div>
            </div>
            ${
              state.auto.mode === "mg"
                ? `
                <div class="mt-3 grid gap-3 md:grid-cols-3">
                  <div class="field">
                    <label class="field-label">Step amount (mg)</label>
                    <input class="input" type="number" min="0" step="0.5" value="${state.auto.stepMg}" data-action="auto-step-mg" />
                  </div>
                </div>
              `
                : `
                <div class="mt-3 grid gap-3 md:grid-cols-3">
                  <div class="field">
                    <label class="field-label">Tablet strength</label>
                    <select class="input" data-action="auto-step-strength">
                      ${state.strengths
                        .map(
                          (strength) =>
                            `<option value="${strength}" ${
                              Number(state.auto.stepStrength) === Number(strength) ? "selected" : ""
                            }>${formatStrength(strength)} mg</option>`
                        )
                        .join("")}
                    </select>
                  </div>
                  <div class="field">
                    <label class="field-label">Tablets per step</label>
                    <input class="input" type="number" min="0" step="0.5" value="${state.auto.stepTablets}" data-action="auto-step-tablets" />
                  </div>
                </div>
              `
            }
            <div class="mt-3 flex flex-wrap gap-2">
              <button class="btn btn-primary" data-action="run-auto">Generate taper</button>
              <button class="btn btn-ghost" data-action="clear-steps">Clear steps</button>
            </div>
            ${
              state.auto.lastRemainder && state.auto.lastRemainder > 0.01
                ? `<div class="notice mt-3">Auto taper note: ${state.auto.lastRemainder} mg could not be allocated using the selected strengths. Please review step doses.</div>`
                : ""
            }
          </div>
        </section>

        <section class="panel no-print">
          <h2 class="text-lg">Step 2 — Review & adjust steps</h2>
          <p class="mt-1 text-sm text-ink/70">Confirm each step before generating the printable handout.</p>
          <div class="mt-3 grid gap-3">${renderSegments()}</div>
          <div class="mt-4 flex flex-wrap gap-2">
            <button class="btn" data-action="add-step">+ Add step</button>
            <button class="btn btn-primary" data-action="generate-handout">Generate handout</button>
          </div>
        </section>

        <section class="panel bg-white">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="text-xl">${medicationLabel} taper schedule</h2>
              <p class="text-sm text-ink/60">Patient-friendly daily checklist</p>
            </div>
            <button class="btn btn-primary no-print ${state.handoutReady ? "" : "opacity-50 cursor-not-allowed"}" id="printBtn" ${
      state.handoutReady ? "" : "disabled"
    }>Print / Save PDF</button>
          </div>
          <div class="no-print mt-3 border-l-4 border-moss/30 bg-moss/5 px-3 py-2 text-xs text-ink/70">
            Tip: In the print dialog, turn off headers/footers to remove the website name and page/date.
          </div>
          <div class="mt-3 text-sm text-ink/70">
            <div>Tablet strengths: ${state.strengths
              .map((s) => `${formatStrength(s)} mg`)
              .join(", ")}</div>
            <div>${state.useDates ? "Start date" : "Dateless"}: ${
      state.useDates && state.startDate ? formatDateDisplay(state.startDate) : "Not set"
    }</div>
            <div>Steps: ${state.segments.length}</div>
          </div>
          ${
            state.handoutReady
              ? renderScheduleTable()
              : `<div class="notice mt-4">Generate the handout after reviewing steps to see the final schedule.</div>`
          }
          <p class="notice mt-4">Check off each day after taking the dose.</p>
          <div class="no-print mt-4 text-xs text-ink/60">
            Other tools:
            <a class="underline" href="https://itstongy.github.io/Days-Since-for-Pharmacists/" target="_blank" rel="noreferrer">
              Days Since for Pharmacists
            </a>
          </div>
        </section>
      </main>
    </div>
  `;

  const printBtn = document.querySelector<HTMLButtonElement>("#printBtn");
  printBtn?.addEventListener("click", () => {
    window.print();
  });
}

function handleClick(event: Event) {
  const target = event.target as HTMLElement | null;
  const action = target?.dataset?.action;
  if (!action) return;

  if (action === "toggle-strength") {
    const strength = Number(target.dataset.strength);
    const input = target as HTMLInputElement;
    if (input.checked) {
      state.strengths.push(strength);
    } else {
      state.strengths = state.strengths.filter((s) => Number(s) !== strength);
    }
    normalizeStrengths();
    state.handoutReady = false;
    render();
    return;
  }

  if (action === "add-custom-strength") {
    const strength = Number(state.customStrength);
    if (!Number.isNaN(strength) && strength > 0) {
      if (!state.strengths.includes(strength)) state.strengths.push(strength);
      state.customStrength = "";
      normalizeStrengths();
      state.handoutReady = false;
      render();
    }
    return;
  }

  if (action === "add-step") {
    state.segments.push(
      createSegment({
        days: 3,
        frequency: "Once daily (od)",
        tablets: state.strengths.reduce<Record<number, number>>((acc, strength) => {
          acc[strength] = 0;
          return acc;
        }, {}),
      })
    );
    state.handoutReady = false;
    render();
    return;
  }

  if (action === "remove") {
    const id = Number(target.dataset.id);
    state.segments = state.segments.filter((segment) => segment.id !== id);
    state.handoutReady = false;
    render();
    return;
  }

  if (action === "duplicate") {
    const id = Number(target.dataset.id);
    const segment = state.segments.find((item) => item.id === id);
    if (segment) {
      state.segments.splice(
        state.segments.indexOf(segment) + 1,
        0,
        createSegment({
          days: segment.days,
          frequency: segment.frequency,
          tablets: { ...segment.tablets },
        })
      );
      state.handoutReady = false;
      render();
    }
    return;
  }

  if (action === "move-up" || action === "move-down") {
    const id = Number(target.dataset.id);
    const idx = state.segments.findIndex((segment) => segment.id === id);
    if (idx === -1) return;
    const swap = action === "move-up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= state.segments.length) return;
    const temp = state.segments[idx];
    state.segments[idx] = state.segments[swap];
    state.segments[swap] = temp;
    state.handoutReady = false;
    render();
    return;
  }

  if (action === "run-auto") {
    generateAutoSchedule();
    render();
    return;
  }

  if (action === "clear-steps") {
    state.segments = [];
    state.handoutReady = false;
    render();
    return;
  }

  if (action === "generate-handout") {
    state.handoutReady = true;
    render();
    return;
  }

  if (action === "reset-all") {
    const next = getInitialState();
    Object.assign(state, next);
    render();
    return;
  }
}

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement | HTMLSelectElement | null;
  const action = target?.dataset?.action;
  if (!action || !target) return;

  if (action === "custom-strength") {
    state.customStrength = target.value;
    return;
  }

  if (action === "set-medication") {
    state.medication = target.value as AppState["medication"];
    state.handoutReady = false;
    render();
    return;
  }

  if (action === "toggle-dates") {
    state.useDates = (target as HTMLInputElement).checked;
    state.handoutReady = false;
    render();
    return;
  }

  if (action === "set-start-date") {
    state.startDate = target.value;
    state.handoutReady = false;
    render();
    return;
  }

  if (action === "auto-start") {
    state.auto.startDose = Number(target.value) || 0;
    state.handoutReady = false;
    return;
  }

  if (action === "auto-days") {
    state.auto.stepDays = Number(target.value) || 1;
    state.handoutReady = false;
    return;
  }

  if (action === "auto-mode") {
    state.auto.mode = target.value as AutoConfig["mode"];
    state.handoutReady = false;
    render();
    return;
  }

  if (action === "auto-step-mg") {
    state.auto.stepMg = Number(target.value) || 0;
    state.handoutReady = false;
    return;
  }

  if (action === "auto-step-strength") {
    state.auto.stepStrength = Number(target.value) || 0;
    state.handoutReady = false;
    return;
  }

  if (action === "auto-step-tablets") {
    state.auto.stepTablets = Number(target.value) || 0;
    state.handoutReady = false;
    return;
  }
}

appEl.addEventListener("click", handleClick);
appEl.addEventListener("input", handleInput);
appEl.addEventListener("change", handleChange);

render();

function handleChange(event: Event) {
  const target = event.target as HTMLInputElement | HTMLSelectElement | null;
  const action = target?.dataset?.action;
  if (!action || !target) return;

  if (action === "update-days") {
    const id = Number(target.dataset.id);
    updateSegment(id, (segment) => {
      segment.days = Number(target.value) || 1;
    });
    state.handoutReady = false;
    render();
    return;
  }

  if (action === "update-tablet") {
    const id = Number(target.dataset.id);
    const strength = Number(target.dataset.strength);
    updateSegment(id, (segment) => {
      segment.tablets[strength] = Number(target.value) || 0;
    });
    state.handoutReady = false;
    render();
    return;
  }

  if (action === "update-frequency-select") {
    const id = Number(target.dataset.id);
    const value = target.value;
    updateSegment(id, (segment) => {
      if (value === "__custom") {
        segment.frequency = DEFAULT_FREQUENCIES.includes(segment.frequency) ? "" : segment.frequency;
      } else {
        segment.frequency = value;
      }
    });
    state.handoutReady = false;
    render();
    return;
  }

  if (action === "update-frequency-custom") {
    const id = Number(target.dataset.id);
    updateSegment(id, (segment) => {
      segment.frequency = target.value;
    });
    state.handoutReady = false;
    render();
    return;
  }
}
