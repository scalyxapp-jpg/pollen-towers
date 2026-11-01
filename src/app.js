import {
	allFloors,
	agentDefinition,
	FLOORS,
	loadLocalFloors,
	nextFreeFloor,
	saveLocalFloors,
	slugify,
} from "./tower.js";
import { fetchBalance, inventCompany, talkToAgent } from "./api.js";

const FLOOR_PITCH = 36;

const ui = {
	connect: document.querySelector("polli-connect"),
	connectState: document.querySelector("#connect-state"),
	towerBody: document.querySelector("#tower-body"),
	liftCar: document.querySelector("#lift-car"),
	office: document.querySelector("#office"),
	officeEmpty: document.querySelector("#office-empty"),
	officeFloor: document.querySelector("#office-floor"),
	officeName: document.querySelector("#office-name"),
	officeTagline: document.querySelector("#office-tagline"),
	officeAgent: document.querySelector("#office-agent"),
	officeRole: document.querySelector("#office-role"),
	officeTasks: document.querySelector("#office-tasks"),
	thread: document.querySelector("#thread"),
	askForm: document.querySelector("#ask-form"),
	askInput: document.querySelector("#ask-input"),
	askButton: document.querySelector("#ask-button"),
	officeStatus: document.querySelector("#office-status"),
	copyAgent: document.querySelector("#copy-agent"),
	directory: document.querySelector("#directory"),
	directoryFilter: document.querySelector("#directory-filter"),
	rentForm: document.querySelector("#rent-form"),
	idea: document.querySelector("#idea"),
	rentButton: document.querySelector("#rent-button"),
	rentStatus: document.querySelector("#rent-status"),
	nextFloor: document.querySelector("#next-floor"),
	lease: document.querySelector("#lease"),
	leaseSummary: document.querySelector("#lease-summary"),
	leaseOpen: document.querySelector("#lease-open"),
	tabs: [...document.querySelectorAll(".tab")],
	views: {
		office: document.querySelector("#view-office"),
		directory: document.querySelector("#view-directory"),
		rent: document.querySelector("#view-rent"),
	},
};

const devKey =
	/^(localhost|127\.0\.0\.1)$/.test(location.hostname) &&
	new URLSearchParams(location.search).get("key");

const state = {
	key: devKey || null,
	local: loadLocalFloors(),
	selected: null,
	threads: new Map(),
	busy: false,
	lastLease: null,
};

ui.connect?.addEventListener("change", async () => {
	state.key = ui.connect.apiKey || devKey || null;
	if (!state.key) {
		ui.connectState.textContent =
			"Not connected. Your own Pollen pays for the agents.";
		return;
	}
	ui.connectState.textContent = "Connected. The agents answer on your Pollen.";
	try {
		const { balance } = await fetchBalance(state.key);
		ui.connectState.textContent = `Connected · ${Number(balance).toFixed(2)} Pollen left in this budget`;
	} catch {
		/* the balance line is optional */
	}
});

function floors() {
	return allFloors(state.local);
}

function companyById(id) {
	return floors().find((company) => company.id === id) ?? null;
}

/* ---------------------------------------------------------------- tower */

function renderTower() {
	const people = floors();
	const byFloor = new Map(people.map((company) => [company.floor, company]));
	ui.towerBody.replaceChildren();

	for (let floor = FLOORS; floor >= 1; floor -= 1) {
		const company = byFloor.get(floor) ?? null;
		const mine = Boolean(
			company && state.local.some((entry) => entry.id === company.id),
		);
		const node = document.createElement("button");
		node.type = "button";
		node.className =
			"floor" + (company ? " lit" : " vacant") + (mine ? " mine" : "");
		node.style.top = `${(FLOORS - floor) * FLOOR_PITCH}px`;
		node.dataset.floor = String(floor);
		node.setAttribute(
			"aria-label",
			company
				? `Floor ${floor}: ${company.name}`
				: `Floor ${floor}: vacant, rent it`,
		);
		if (state.selected === (company?.id ?? null) && company) {
			node.classList.add("selected");
		}

		const number = document.createElement("span");
		number.className = "number";
		number.textContent = String(floor).padStart(2, "0");

		const tenant = document.createElement("span");
		tenant.className = "tenant";
		tenant.textContent = company ? company.name : mine ? "to let" : "to let";

		const lantern = document.createElement("span");
		lantern.className = "lantern";
		lantern.setAttribute("aria-hidden", "true");

		node.append(number, tenant, lantern);
		node.addEventListener("click", () => {
			if (company) selectCompany(company.id);
			else selectFloorForRent(floor);
		});
		ui.towerBody.append(node);
	}
}

function moveLift(floor) {
	ui.liftCar.style.transform = `translateY(${(FLOORS - floor) * FLOOR_PITCH + 4}px)`;
}

/* --------------------------------------------------------------- office */

function selectCompany(id) {
	const company = companyById(id);
	if (!company) return;
	state.selected = id;
	renderTower();
	moveLift(company.floor);
	switchView("office");
	renderOffice(company);
}

function selectFloorForRent(floor) {
	const free = nextFreeFloor(state.local);
	switchView("rent");
	if (free && floor !== free) {
		ui.nextFloor.textContent = `Floor ${free} is the next empty office — this form signs that one.`;
	} else {
		ui.nextFloor.textContent = `Floor ${floor} is empty and waiting for a tenant.`;
	}
	ui.idea.focus();
}

function renderOffice(company) {
	ui.officeEmpty.hidden = true;
	ui.office.hidden = false;
	ui.officeFloor.textContent = `Floor ${company.floor}`;
	ui.officeName.textContent = company.name;
	ui.officeTagline.textContent = company.tagline;
	ui.officeAgent.textContent = company.agentName;
	ui.officeRole.textContent = company.agentRole;

	ui.officeTasks.replaceChildren();
	for (const task of company.tasks) {
		const chip = document.createElement("button");
		chip.type = "button";
		chip.className = "task";
		chip.textContent = task;
		chip.addEventListener("click", () => send(task));
		ui.officeTasks.append(chip);
	}

	renderThread(company);
	ui.officeStatus.textContent = "";
}

function renderThread(company) {
	const turns = state.threads.get(company.id) ?? [];
	ui.thread.replaceChildren();
	if (turns.length === 0) {
		const intro = document.createElement("p");
		intro.className = "intro";
		intro.textContent = `${company.agentName} is at the desk on floor ${company.floor}. Today: ${company.tasks[0]}. Pick a job or write your own — the agent drafts, you decide.`;
		ui.thread.append(intro);
	}
	for (const turn of turns) {
		ui.thread.append(turnNode(turn));
	}
	ui.thread.scrollTop = ui.thread.scrollHeight;
}

/** The agents answer in plain prose but sometimes slip into markdown. */
function plain(text) {
	return text
		.replace(/\*\*(.+?)\*\*/g, "$1")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/^#{1,6}\s*/gm, "")
		.trim();
}

function turnNode({ role, content, pending }) {
	const node = document.createElement("div");
	node.className = `turn ${role === "user" ? "owner" : "agent"}${pending ? " pending" : ""}`;
	const who = document.createElement("span");
	who.className = "who";
	who.textContent = role === "user" ? "Owner" : "Agent";
	node.append(who, document.createTextNode(content));
	return node;
}

async function send(message) {
	const company = companyById(state.selected);
	if (!company || state.busy) return;
	const text = message.trim();
	if (!text) return;
	if (!state.key) {
		ui.officeStatus.textContent =
			"Connect first — the agent spends your own Pollen.";
		ui.officeStatus.classList.add("error");
		return;
	}

	state.busy = true;
	ui.askButton.disabled = true;
	ui.officeStatus.classList.remove("error");
	ui.officeStatus.textContent = `${company.agentName} is working…`;

	const history = state.threads.get(company.id) ?? [];
	history.push({ role: "user", content: text });
	const pending = { role: "assistant", content: "…", pending: true };
	state.threads.set(company.id, [...history, pending]);
	renderThread(company);
	ui.askInput.value = "";

	try {
		const reply = await talkToAgent({
			apiKey: state.key,
			company,
			history,
			message: text,
		});
		history.push({ role: "assistant", content: plain(reply) });
		state.threads.set(company.id, history);
		ui.officeStatus.textContent = "";
	} catch (error) {
		history.pop();
		state.threads.set(company.id, history);
		ui.officeStatus.textContent = error.message;
		ui.officeStatus.classList.add("error");
	} finally {
		state.busy = false;
		ui.askButton.disabled = false;
		renderThread(company);
		ui.thread.scrollTop = ui.thread.scrollHeight;
		ui.askInput.focus();
	}
}

ui.askForm.addEventListener("submit", (event) => {
	event.preventDefault();
	void send(ui.askInput.value);
});

ui.copyAgent.addEventListener("click", async () => {
	const company = companyById(state.selected);
	if (!company) return;
	const definition = JSON.stringify(agentDefinition(company), null, 2);
	try {
		await navigator.clipboard.writeText(
			`curl -X POST https://gen.pollinations.ai/account/agents \\\n  -H 'Authorization: Bearer $POLLINATIONS_KEY' \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify(agentDefinition(company))}'`,
		);
		ui.officeStatus.textContent =
			"Agent definition copied — POST /account/agents publishes it.";
	} catch {
		ui.officeStatus.textContent = definition.slice(0, 160);
	}
});

/* ------------------------------------------------------------- directory */

function renderDirectory(filter = "") {
	const needle = filter.trim().toLowerCase();
	const people = floors().filter((company) => {
		if (!needle) return true;
		return [
			company.name,
			company.industry,
			company.tagline,
			String(company.floor),
		]
			.join(" ")
			.toLowerCase()
			.includes(needle);
	});

	ui.directory.replaceChildren();
	if (!people.length) {
		const empty = document.createElement("li");
		empty.className = "muted";
		empty.textContent = "No floor matches that.";
		ui.directory.append(empty);
		return;
	}

	for (const company of people) {
		const item = document.createElement("li");
		const button = document.createElement("button");
		button.type = "button";
		button.addEventListener("click", () => selectCompany(company.id));

		const floor = document.createElement("span");
		floor.className = "floor-no";
		floor.textContent = String(company.floor).padStart(2, "0");

		const who = document.createElement("span");
		const name = document.createElement("span");
		name.className = "who-name";
		name.textContent = company.name;
		const tag = document.createElement("span");
		tag.className = "who-tag";
		tag.textContent = company.tagline;
		who.append(name, tag);

		const industry = document.createElement("span");
		industry.className = "industry";
		industry.textContent = company.industry;

		button.append(floor, who, industry);
		item.append(button);
		ui.directory.append(item);
	}
}

ui.directoryFilter.addEventListener("input", () => {
	renderDirectory(ui.directoryFilter.value);
});

/* ------------------------------------------------------------------ rent */

ui.rentForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	if (state.busy) return;
	if (!state.key) {
		setRentStatus(
			"Connect first — inventing the company costs a fraction of a Pollen.",
			true,
		);
		return;
	}
	const floor = nextFreeFloor(state.local);
	if (!floor) {
		setRentStatus("Every floor is taken. The tower is full.", true);
		return;
	}

	state.busy = true;
	ui.rentButton.disabled = true;
	setRentStatus("The agent is drafting a charter…");

	try {
		const drafted = await inventCompany({
			apiKey: state.key,
			idea: ui.idea.value,
			floor,
		});
		const company = {
			...drafted,
			floor,
			id: slugify(drafted.name) + "-" + floor,
			rentedAt: new Date().toISOString(),
		};
		state.local = [...state.local, company];
		saveLocalFloors(state.local);
		state.lastLease = company;
		ui.lease.hidden = false;
		ui.leaseSummary.textContent = `Floor ${floor}: ${company.name} — ${company.agentName} (${company.agentRole}) will bring you three jobs each morning.`;
		renderTower();
		renderDirectory(ui.directoryFilter.value);
		setRentStatus(`Lease signed on floor ${floor}.`);
		ui.idea.value = "";
		selectCompany(company.id);
	} catch (error) {
		setRentStatus(error.message, true);
	} finally {
		state.busy = false;
		ui.rentButton.disabled = false;
	}
});

function setRentStatus(message, error = false) {
	ui.rentStatus.textContent = message;
	ui.rentStatus.classList.toggle("error", error);
}

ui.leaseOpen.addEventListener("click", () => {
	if (state.lastLease) selectCompany(state.lastLease.id);
});

/* ------------------------------------------------------------------ tabs */

function switchView(view) {
	for (const tab of ui.tabs) {
		const active = tab.dataset.view === view;
		tab.classList.toggle("active", active);
		tab.setAttribute("aria-selected", String(active));
	}
	for (const [name, element] of Object.entries(ui.views)) {
		element.hidden = name !== view;
	}
}

for (const tab of ui.tabs) {
	tab.addEventListener("click", () => {
		switchView(tab.dataset.view);
		if (tab.dataset.view === "directory")
			renderDirectory(ui.directoryFilter.value);
	});
}

/* --------------------------------------------------------- tower drag */

let drag = null;
ui.towerBody.addEventListener("pointerdown", (event) => {
	drag = { x: event.clientX, spin: currentSpin() };
	ui.towerBody.classList.add("dragging");
	ui.towerBody.setPointerCapture(event.pointerId);
});

ui.towerBody.addEventListener("pointermove", (event) => {
	if (!drag) return;
	const spin = drag.spin + (event.clientX - drag.x) * 0.35;
	ui.towerBody.style.setProperty("--spin", `${spin}deg`);
});

for (const type of ["pointerup", "pointercancel"]) {
	ui.towerBody.addEventListener(type, () => {
		drag = null;
		ui.towerBody.classList.remove("dragging");
	});
}

function currentSpin() {
	const value = getComputedStyle(ui.towerBody)
		.getPropertyValue("--spin")
		.trim();
	return Number.parseFloat(value) || 0;
}

/* ------------------------------------------------------------------ boot */

renderTower();
renderDirectory();
if (state.local.length > 0) {
	selectCompany(state.local[0].id);
} else {
	selectCompany("kettle");
}
ui.nextFloor.textContent = `Floor ${nextFreeFloor(state.local)} is the next empty office.`;
