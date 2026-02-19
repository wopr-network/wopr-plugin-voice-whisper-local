import { describe, expect, it, vi } from "vitest";
import { getWebMCPHandlers, getWebMCPToolDeclarations } from "../webmcp.js";

const mockProvider = {
	metadata: {
		name: "whisper-local",
		type: "stt",
		version: "1.0.0",
		description: "Local STT using faster-whisper in Docker",
		local: true,
		capabilities: ["batch", "streaming"],
	},
	healthCheck: vi.fn().mockResolvedValue(true),
};

describe("getWebMCPToolDeclarations", () => {
	it("returns 2 declarations", () => {
		const decls = getWebMCPToolDeclarations();
		expect(decls).toHaveLength(2);
	});

	it("all declarations have readOnlyHint: true", () => {
		const decls = getWebMCPToolDeclarations();
		for (const d of decls) {
			expect(d.annotations?.readOnlyHint).toBe(true);
		}
	});

	it("declaration names are namespaced with whisper-local.", () => {
		const decls = getWebMCPToolDeclarations();
		for (const d of decls) {
			expect(d.name).toMatch(/^whisper-local\./);
		}
	});

	it("includes getStatus and listModels", () => {
		const names = getWebMCPToolDeclarations().map((d) => d.name);
		expect(names).toContain("whisper-local.getStatus");
		expect(names).toContain("whisper-local.listModels");
	});
});

describe("getWebMCPHandlers", () => {
	describe("whisper-local.getStatus", () => {
		it("returns provider info", async () => {
			const handlers = getWebMCPHandlers(mockProvider, "small");
			const result = (await handlers["whisper-local.getStatus"]({})) as any;
			expect(result.provider).toBe("whisper-local");
			expect(result.type).toBe("stt");
			expect(result.local).toBe(true);
			expect(result.healthy).toBe(true);
		});

		it("does not expose apiKey or secrets", async () => {
			const handlers = getWebMCPHandlers(mockProvider, "small");
			const result = await handlers["whisper-local.getStatus"]({});
			expect(JSON.stringify(result)).not.toContain("apiKey");
			expect(JSON.stringify(result)).not.toContain("sk-");
		});
	});

	describe("whisper-local.listModels", () => {
		it("returns 5 models", async () => {
			const handlers = getWebMCPHandlers(mockProvider, "small");
			const result = (await handlers["whisper-local.listModels"]({})) as any;
			expect(result.models).toHaveLength(5);
		});

		it("includes currentModel", async () => {
			const handlers = getWebMCPHandlers(mockProvider, "small");
			const result = (await handlers["whisper-local.listModels"]({})) as any;
			expect(result.currentModel).toBe("small");
		});

		it("model list includes tiny through large-v3", async () => {
			const handlers = getWebMCPHandlers(mockProvider, "large-v3");
			const result = (await handlers["whisper-local.listModels"]({})) as any;
			const ids = result.models.map((m: any) => m.id);
			expect(ids).toContain("tiny");
			expect(ids).toContain("base");
			expect(ids).toContain("small");
			expect(ids).toContain("medium");
			expect(ids).toContain("large-v3");
		});

		it("reflects the currentModel passed in", async () => {
			const handlers = getWebMCPHandlers(mockProvider, "large-v3");
			const result = (await handlers["whisper-local.listModels"]({})) as any;
			expect(result.currentModel).toBe("large-v3");
		});
	});
});
