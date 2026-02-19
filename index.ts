/**
 * WOPR Voice Plugin: Whisper Local (faster-whisper Docker)
 *
 * Provides local STT using faster-whisper server running in Docker.
 * Automatically pulls and manages the Docker container.
 *
 * Usage:
 * ```typescript
 * // Plugin auto-registers on init
 * // Channel plugins access via:
 * const stt = ctx.getExtension<STTProvider>('stt');
 * if (stt) {
 *   const text = await stt.transcribe(audioBuffer);
 * }
 * ```
 */

import type { WOPRPlugin, WOPRPluginContext } from "wopr";
import type {
	STTOptions,
	STTProvider,
	STTSession,
	STTTranscriptChunk,
	VoicePluginMetadata,
} from "wopr/voice";
import { getWebMCPHandlers, getWebMCPToolDeclarations } from "./webmcp.js";

// =============================================================================
// Configuration
// =============================================================================

interface WhisperLocalConfig {
	/** Docker image to use */
	image?: string;
	/** Model size: tiny, base, small, medium, large-v3 */
	model?: string;
	/** Port to expose the whisper server on */
	port?: number;
	/** Language code (e.g., "en", "auto" for auto-detect) */
	language?: string;
	/** Enable word timestamps */
	wordTimestamps?: boolean;
}

const DEFAULT_CONFIG: Required<WhisperLocalConfig> = {
	image: "fedirz/faster-whisper-server:latest-cpu",
	model: "small",
	port: 8765,
	language: "en",
	wordTimestamps: false,
};

// =============================================================================
// STT Session Implementation
// =============================================================================

class WhisperLocalSession implements STTSession {
	private chunks: Buffer[] = [];
	private ended = false;
	private partialCallback?: (chunk: STTTranscriptChunk) => void;

	constructor(
		private serverUrl: string,
		private options: STTOptions,
	) {}

	sendAudio(audio: Buffer): void {
		if (this.ended) {
			throw new Error("Session ended, cannot send more audio");
		}
		this.chunks.push(audio);
	}

	endAudio(): void {
		this.ended = true;
	}

	onPartial(callback: (chunk: STTTranscriptChunk) => void): void {
		this.partialCallback = callback;
	}

	async waitForTranscript(timeoutMs = 30000): Promise<string> {
		// Wait for end signal or timeout
		const startTime = Date.now();
		while (!this.ended && Date.now() - startTime < timeoutMs) {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		if (!this.ended) {
			throw new Error("Transcript timeout - audio stream not ended");
		}

		// Combine all chunks
		const audioBuffer = Buffer.concat(this.chunks);

		// Send to whisper server
		const formData = new FormData();
		formData.append(
			"file",
			new Blob([audioBuffer], { type: "audio/wav" }),
			"audio.wav",
		);
		formData.append("language", this.options.language || "en");

		const response = await fetch(`${this.serverUrl}/v1/audio/transcriptions`, {
			method: "POST",
			body: formData,
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Whisper server error: ${response.status} - ${error}`);
		}

		const result = await response.json();
		return result.text || "";
	}

	async close(): Promise<void> {
		this.ended = true;
		this.chunks = [];
	}
}

// =============================================================================
// STT Provider Implementation
// =============================================================================

class WhisperLocalProvider implements STTProvider {
	readonly metadata: VoicePluginMetadata = {
		name: "whisper-local",
		version: "1.0.0",
		type: "stt",
		description: "Local STT using faster-whisper in Docker",
		capabilities: ["batch", "streaming"],
		local: true,
		docker: true,
		emoji: "🎙️",
		homepage: "https://github.com/SYSTRAN/faster-whisper",
		requires: {
			docker: ["fedirz/faster-whisper-server:latest"],
		},
		install: [
			{
				kind: "docker",
				image: "fedirz/faster-whisper-server",
				tag: "latest-cpu",
				label: "Pull faster-whisper server image",
			},
		],
	};

	private config: Required<WhisperLocalConfig>;
	private serverUrl: string;
	private containerId?: string;
	private docker?: any; // Dockerode instance

	constructor(config: WhisperLocalConfig = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.serverUrl = `http://localhost:${this.config.port}`;
	}

	get model(): string {
		return this.config.model;
	}

	validateConfig(): void {
		// Validate model size
		const validModels = ["tiny", "base", "small", "medium", "large-v3"];
		if (!validModels.includes(this.config.model)) {
			throw new Error(
				`Invalid model: ${this.config.model}. Valid: ${validModels.join(", ")}`,
			);
		}

		// Port range
		if (this.config.port < 1024 || this.config.port > 65535) {
			throw new Error(`Invalid port: ${this.config.port}`);
		}
	}

	async createSession(options?: STTOptions): Promise<STTSession> {
		await this.ensureServerRunning();
		return new WhisperLocalSession(this.serverUrl, {
			language: this.config.language,
			...options,
		});
	}

	async transcribe(audio: Buffer, options?: STTOptions): Promise<string> {
		await this.ensureServerRunning();

		const formData = new FormData();
		formData.append(
			"file",
			new Blob([audio], { type: "audio/wav" }),
			"audio.wav",
		);
		formData.append("language", options?.language || this.config.language);

		const response = await fetch(`${this.serverUrl}/v1/audio/transcriptions`, {
			method: "POST",
			body: formData,
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Whisper server error: ${response.status} - ${error}`);
		}

		const result = await response.json();
		return result.text || "";
	}

	async healthCheck(): Promise<boolean> {
		try {
			const response = await fetch(`${this.serverUrl}/health`, {
				method: "GET",
				signal: AbortSignal.timeout(5000),
			});
			return response.ok;
		} catch {
			return false;
		}
	}

	async shutdown(): Promise<void> {
		if (this.containerId && this.docker) {
			try {
				const container = this.docker.getContainer(this.containerId);
				await container.stop();
				await container.remove();
				console.log(`[whisper-local] Container ${this.containerId} stopped`);
			} catch (err) {
				console.error(`[whisper-local] Failed to stop container:`, err);
			}
		}
		this.containerId = undefined;
	}

	// -------------------------------------------------------------------------
	// Private: Docker management
	// -------------------------------------------------------------------------

	private async ensureServerRunning(): Promise<void> {
		// Check if already running
		if (await this.healthCheck()) {
			return;
		}

		// Start Docker container
		await this.startContainer();

		// Wait for server to be ready
		const maxWait = 60000;
		const startTime = Date.now();
		while (Date.now() - startTime < maxWait) {
			if (await this.healthCheck()) {
				console.log(`[whisper-local] Server ready on port ${this.config.port}`);
				return;
			}
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		throw new Error("Whisper server failed to start within 60 seconds");
	}

	private async startContainer(): Promise<void> {
		// Lazy load dockerode
		if (!this.docker) {
			const Docker = (await import("dockerode")).default;
			this.docker = new Docker();
		}

		console.log(`[whisper-local] Starting faster-whisper container...`);

		// Pull image if not present
		try {
			await this.pullImage();
		} catch (err) {
			console.warn(`[whisper-local] Image pull warning:`, err);
		}

		// Create and start container
		const container = await this.docker.createContainer({
			Image: this.config.image,
			Env: [
				`WHISPER_MODEL=${this.config.model}`,
				`WHISPER_LANGUAGE=${this.config.language}`,
			],
			HostConfig: {
				PortBindings: {
					"8000/tcp": [{ HostPort: String(this.config.port) }],
				},
				AutoRemove: true,
			},
			ExposedPorts: {
				"8000/tcp": {},
			},
		});

		await container.start();
		this.containerId = container.id;
		console.log(`[whisper-local] Container started: ${this.containerId}`);
	}

	private async pullImage(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.docker.pull(this.config.image, (err: Error, stream: any) => {
				if (err) {
					reject(err);
					return;
				}
				this.docker.modem.followProgress(
					stream,
					(err: Error) => (err ? reject(err) : resolve()),
					(event: any) => {
						if (event.status) {
							console.log(`[whisper-local] ${event.status}`);
						}
					},
				);
			});
		});
	}
}

// =============================================================================
// Plugin Export
// =============================================================================

let provider: WhisperLocalProvider | null = null;

// Extended with getManifest/getWebMCPHandlers for webui bindPluginLifecycle()
const plugin: WOPRPlugin & {
	getManifest(): { webmcpTools: ReturnType<typeof getWebMCPToolDeclarations> };
	getWebMCPHandlers(): Record<
		string,
		(input: Record<string, unknown>) => Promise<unknown>
	>;
} = {
	name: "voice-whisper-local",
	version: "1.0.0",
	description: "Local STT using faster-whisper in Docker",

	async init(ctx: WOPRPluginContext) {
		const config = ctx.getConfig<WhisperLocalConfig>();
		provider = new WhisperLocalProvider(config);

		try {
			provider.validateConfig();
			ctx.registerExtension("stt", provider);
			ctx.registerCapabilityProvider("stt", {
				id: provider.metadata.name,
				name: provider.metadata.description || provider.metadata.name,
			});
			ctx.log.info("Whisper Local STT provider registered");
		} catch (err) {
			ctx.log.error(`Failed to register Whisper Local: ${err}`);
		}
	},

	async shutdown() {
		if (provider) {
			await provider.shutdown();
			provider = null;
		}
	},

	getManifest() {
		return { webmcpTools: getWebMCPToolDeclarations() };
	},

	getWebMCPHandlers() {
		// Return handlers that resolve `provider` at call time, not at registration
		// time, so tools are available even if called before init() completes.
		return {
			"whisper-local.getStatus": async (input: Record<string, unknown>) => {
				if (!provider) throw new Error("whisper-local provider not initialized");
				return getWebMCPHandlers(provider, provider.model)["whisper-local.getStatus"](input);
			},
			"whisper-local.listModels": async (input: Record<string, unknown>) => {
				if (!provider) throw new Error("whisper-local provider not initialized");
				return getWebMCPHandlers(provider, provider.model)["whisper-local.listModels"](input);
			},
		};
	},
};

export default plugin;
