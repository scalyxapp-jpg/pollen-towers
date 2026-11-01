/**
 * Pollinations client for the tower. Every call spends the caller's key.
 */

import { BASE_MODEL } from "./tower.js";

const BASE = "https://gen.pollinations.ai";

export class ApiError extends Error {
	constructor(message, status) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
}

async function readError(response) {
	try {
		const body = await response.json();
		return body?.error?.message || body?.message || response.statusText;
	} catch {
		return response.statusText;
	}
}

/**
 * One turn with a company agent.
 * @param {{apiKey: string, company: object, history: {role: string, content: string}[], message: string}} input
 */
export async function talkToAgent({
	apiKey,
	company,
	history,
	message,
	signal,
}) {
	const response = await fetch(`${BASE}/v1/chat/completions`, {
		method: "POST",
		signal,
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: BASE_MODEL,
			reasoning_effort: "low",
			max_tokens: 700,
			messages: [
				{
					role: "system",
					content: [
						company.systemPrompt,
						"",
						`You work on floor ${company.floor} of Pollen Towers.`,
						`Today's open tasks: ${company.tasks.join(" · ")}`,
						"Stay in character, keep replies under 180 words, and end with a decision or a question for the owner.",
					].join("\n"),
				},
				...history.slice(-8).map(({ role, content }) => ({ role, content })),
				{ role: "user", content: message },
			],
		}),
	});

	if (!response.ok)
		throw new ApiError(await readError(response), response.status);
	const body = await response.json();
	const text = body?.choices?.[0]?.message?.content?.trim();
	if (!text) throw new ApiError("The agent said nothing.", 502);
	return text;
}

/**
 * Turn a business idea into a tenant and its agent.
 * @returns {Promise<object>}
 */
export async function inventCompany({ apiKey, idea, floor }) {
	const response = await fetch(`${BASE}/v1/chat/completions`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: BASE_MODEL,
			reasoning_effort: "low",
			max_tokens: 900,
			messages: [
				{
					role: "system",
					content:
						"You design very small companies: one person and one agent doing real work. You answer with JSON only.",
				},
				{
					role: "user",
					content: [
						`Design a tenant for floor ${floor} of a building of AI-run companies.`,
						`Idea: ${idea || "something small, useful and a little odd"}`,
						"Rules: the business must be plausible at one person scale, the agent must do the daily work, and the owner only decides.",
						'Reply as {"name":"...","tagline":"one sentence","industry":"commerce|services|software|publishing|finance|education|design|care","agentName":"...","agentRole":"...","systemPrompt":"60-120 words, second person, describing how the agent works and what it refuses to do","tasks":["...","...","..."]}',
					].join("\n"),
				},
			],
		}),
	});

	if (!response.ok)
		throw new ApiError(await readError(response), response.status);
	const body = await response.json();
	const raw = body?.choices?.[0]?.message?.content ?? "";
	const parsed = parseJson(raw);
	if (!parsed?.name || !parsed?.systemPrompt) {
		throw new ApiError("The model did not return a usable company.", 502);
	}
	return {
		name: String(parsed.name).slice(0, 60),
		tagline: String(parsed.tagline ?? "").slice(0, 160),
		industry: String(parsed.industry ?? "services").slice(0, 24),
		agentName: String(parsed.agentName ?? "Ada").slice(0, 40),
		agentRole: String(parsed.agentRole ?? "Agent").slice(0, 60),
		systemPrompt: String(parsed.systemPrompt).slice(0, 2000),
		tasks: Array.isArray(parsed.tasks)
			? parsed.tasks.slice(0, 3).map((task) => String(task).slice(0, 120))
			: ["Write today's report"],
	};
}

export function parseJson(text) {
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start === -1 || end === -1) return null;
	try {
		return JSON.parse(text.slice(start, end + 1));
	} catch {
		return null;
	}
}

export async function fetchBalance(apiKey) {
	const response = await fetch(`${BASE}/account/balance`, {
		headers: { Authorization: `Bearer ${apiKey}` },
	});
	if (!response.ok)
		throw new ApiError(await readError(response), response.status);
	return response.json();
}
