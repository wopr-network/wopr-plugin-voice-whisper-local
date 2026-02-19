/**
 * WebMCP tool registration for Whisper Local STT.
 * Exposes getStatus, listModels as read-only browser tools.
 */

const WHISPER_MODELS = [
	{
		id: "tiny",
		name: "Tiny",
		description: "Fastest, lowest accuracy (~1GB VRAM)",
	},
	{ id: "base", name: "Base", description: "Fast, good accuracy (~1GB VRAM)" },
	{
		id: "small",
		name: "Small",
		description: "Balanced speed/accuracy (~2GB VRAM)",
	},
	{ id: "medium", name: "Medium", description: "High accuracy (~5GB VRAM)" },
	{
		id: "large-v3",
		name: "Large v3",
		description: "Best accuracy (~10GB VRAM)",
	},
];

interface WhisperProvider {
	readonly metadata: {
		name: string;
		type: string;
		version: string;
		description: string;
		local: boolean;
		capabilities: string[];
	};
	healthCheck(): Promise<boolean>;
}

export function getWebMCPToolDeclarations() {
	return [
		{
			name: "whisper-local.getStatus",
			description: "Get status of the Whisper local STT provider",
			inputSchema: { type: "object", properties: {} },
			annotations: { readOnlyHint: true },
		},
		{
			name: "whisper-local.listModels",
			description: "List available Whisper STT models",
			inputSchema: { type: "object", properties: {} },
			annotations: { readOnlyHint: true },
		},
	];
}

export function getWebMCPHandlers(
	provider: WhisperProvider,
	currentModel: string,
): Record<string, (input: Record<string, unknown>) => Promise<unknown>> {
	return {
		"whisper-local.getStatus": async () => ({
			provider: provider.metadata.name,
			type: provider.metadata.type,
			version: provider.metadata.version,
			description: provider.metadata.description,
			local: provider.metadata.local,
			capabilities: provider.metadata.capabilities,
			healthy: await provider.healthCheck(),
		}),

		"whisper-local.listModels": async () => ({
			provider: provider.metadata.name,
			models: WHISPER_MODELS,
			currentModel,
		}),
	};
}
